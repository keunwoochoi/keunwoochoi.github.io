# Tutorial: Scalable and modular data loading, 2025 edition — With Torchdata 0.10.1

# 1. Torchdata 0.10.1 and more

Torchdata has been our choice since 2023 March, in Prescient-LM — where I have been training LLMs. It was great! It was somewhat difficult to use sometimes, it didn’t have full documentation, etc, but it worked when it worked. Then it was 2023 July when [it was officially discontinued at 0.7.0](https://github.com/pytorch/data/issues/1196). We were so sad. A year later, [the maintainers announced](https://github.com/pytorch/data/issues/1196#issuecomment-2161155825) that it will become alive again (*yes!*), with deprecating the existing approach (*hm?*) at 0.8.0, putting me into a mixed feeling. 

[Torchdata 0.10.1](https://pytorch.org/data/0.10/), the latest version as of 2025 Feb, is an outcome of the new approach. It has some essential implementation. I wasn’t sure if it’s ready to use yet, based on the README and the documentation. Turned out, the code is much more ready than I thought. I gave a shot, and gosh, it works! As an ENFP, my only natural action item is to write a blog post about it. 

# 2. Why Torchdata

As of 2025, the training data loading is a solved problem when the model and data are small. Use `torch` or something to load the model to GPU, load the data on memory, feed the data to the GPU with utilities such as [`torch.utils.data.Dataset`](https://pytorch.org/docs/stable/data.html#torch.utils.data.Dataset) and then *go* - Also, there are enough docs and examples online. 

But why is it not enough? Well, let’s see why `Torchdata` exists.

## Requirements

> Torchdata is a library of *composable iterators* (not iterables!) that let you chain together common dataloading and pre-proc operations. It follows a streaming programming model, although “sampler + Map-style” can still be configured if you desire.
> 
> 
> `torchdata.nodes` adds more flexibility to the standard `torch.utils.data` offering, and introduces multi-threaded parallelism in addition to multi-process (the only supported approach in `torch.utils.data.DataLoader`), as well as first-class support for mid-epoch checkpointing through a `state_dict/load_state_dict` interface.
> 

In other words, the existing `torch.utils.data.Dataset` is not ideal if -

- you want to stream (a lot of) data
- you want flexibility to compose data processing, because your dataset is heterogeneous (i.e., messy)
- no random sampling and random access is needed since things are pre-shuffled.

Often, this may means:

- Since you have too much data (yes!), you need to load it from remote (s3 bucket, for example)
- Likewise, model is big and you definitely need multi-gpu and multi-node training
- You’d hate latencies. Some nice features like prefetch is nearly necessary
- Therefore, more cpu & network to use for the real-time data processing
- Therefore of therefore, you want to control multiprocessing and multithreading nicely

Now we’re talking about large-scale training, where you’d like to ensure everything is fine. One requirement may be:

- Resume training from exactly where we were

## Can’t we do this with `Dataset` and `DataLoader`?

Technically, almost everything is possible except some limitation on multithreading. Perhaps that’s optional and you could just do it with `Dataset` and `IterableDataset`. But it would be cumbersome, and as Homo Sapiens, we aspire to find better tools. 

# 3. Example

I’ll show you the `Node` classes I’m using now. This is the data / functional flow for a dataset I use.

```bash
[list files] -> .jsonl files -> [load jsonl] ->  json dict -> [text processor] -> processed and rendered text -> [tokenizer] -> token ids -> [pack it or trim it] --> token ids -> [batching] -> batch of token ids -> [end of data loader]
```

## Basic `io`

Based the provided nodes and the README under `torchdata.nodes` , here’s some basic custom nodes I wrote. First, `LocalFileListNode` .

```python
import json
import logging
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Union

import pyarrow.parquet as pq
from torchdata.nodes import BaseNode

logger = logging.getLogger(__name__)

class LocalFileListNode(BaseNode[str]):
    """Node that lists files from a local directory matching specified patterns."""

    def __init__(self, root_dir: Union[str, Path], patterns: List[str]):
        super().__init__()
        self.root_dir = Path(root_dir)
        self.patterns = patterns
        self._files: Optional[List[Path]] = None
        self._current_idx: int = 0

    def reset(self, initial_state: Optional[Dict[str, Any]] = None):
        super().reset(initial_state)
        if initial_state is not None:
            self._current_idx = initial_state["current_idx"]
        else:
            self._current_idx = 0

        if self._files is None:
            self._files = []
            for pattern in self.patterns:
                self._files.extend(self.root_dir.glob(pattern))
            self._files.sort()  # for deterministic ordering

    def next(self) -> str:
        if self._current_idx >= len(self._files):
            raise StopIteration

        file_path = self._files[self._current_idx]
        self._current_idx += 1
        return str(file_path)

    def get_state(self) -> Dict[str, Any]:
        return {"current_idx": self._current_idx}
```

- In `__init__()`, This node is instantiated with `root_dir` and the file name `patterns` .
- `reset()` finds files from `root_dir` and sort them.
- `reset()` and `get_state()` are useful for stateful data loading, checkpointing, and resuming.
- `next()` is the core! This method defines how this node as an iterator would work. Based on the files we found in `reset()`, the iterator will output the file path one by one.

Let’s move on and build the json loader.

```python
class JsonLinesReaderNode(BaseNode[Dict]):
    """Node that reads JSON Lines format files."""

    def __init__(self, source_node: BaseNode[str]):
        super().__init__()
        self.source = source_node
        self._current_lines = None
        self._current_line_idx = 0

    def reset(self, initial_state: Optional[Dict[str, Any]] = None):
        super().reset(initial_state)
        self.source.reset(initial_state.get("source_state") if initial_state else None)
        self._current_lines = None
        if initial_state is not None:
            self._current_line_idx = initial_state["current_line_idx"]
        else:
            self._current_line_idx = 0

    def _load_next_file(self) -> tuple[bool, str]:
        try:
            filepath = next(self.source)
            # Load entire file into memory
            with open(filepath, 'r') as f:
                self._current_lines = f.readlines()
            self._current_line_idx = 0
            return True, filepath
        except StopIteration:
            return False, ""

    def next(self) -> Dict:
        file_path = ""  # just to calm down my ide
        while True:
            if self._current_lines is None or self._current_line_idx >= len(self._current_lines):
                success, file_path = self._load_next_file()
                if not success:
                    raise StopIteration
            try:
                line = self._current_lines[self._current_line_idx]
                self._current_line_idx += 1
                try:
                    data = json.loads(line)
                    return {"json_dict": data,
                            "metadata":
                                {"file_path": file_path, "line_number": self._current_line_idx}
                            }
                except json.JSONDecodeError as e:
                    logger.warning(f"Skipping invalid JSON line: {e}")
                    continue
            except IndexError:
                # Current file is exhausted, set to None and continue to load next file
                self._current_lines = None
                continue

    def get_state(self) -> Dict[str, Any]:
        return {
            "source_state": self.source.state_dict(),
            "current_line_idx": self._current_line_idx
        }
```

- See `__init__()`.  `JsonLinesReaderNode` is not a starting node; it takes a source node, something like `LocalFileListNode` , then continues processing the data.
- In `next()`, it reads a jsonline file and outputs each line. I chose to separate the json dict from metadata.
- Now that it has a source node, its state includes `self.source.state_dict()` as well as its own state, `"current_line_idx"`.

```python
class ParquetReaderNode(BaseNode[Dict]):
    """Node that reads Parquet files and yields records one by one."""

    def __init__(self, source_node: BaseNode[str]):
        super().__init__()
        self.source = source_node
        self._current_records = None
        self._current_idx = 0

    def reset(self, initial_state: Optional[Dict[str, Any]] = None):
        super().reset(initial_state)
        self.source.reset(initial_state.get("source_state") if initial_state else None)
        if initial_state is not None:
            self._current_idx = initial_state["current_idx"]
        else:
            self._current_records = None
            self._current_idx = 0

    def _load_next_file(self) -> bool:
        try:
            filepath = next(self.source)
            # Load entire file into memory
            table = pq.read_table(filepath)
            self._current_records = table.to_pylist()
            self._current_idx = 0
            return True
        except StopIteration:
            return False

    def next(self) -> Dict:
        while True:
            if self._current_records is None or self._current_idx >= len(self._current_records):
                if not self._load_next_file():
                    raise StopIteration

            record = self._current_records[self._current_idx]
            self._current_idx += 1
            return record

    def get_state(self) -> Dict[str, Any]:
        return {
            "source_state": self.source.state_dict(),
            "current_idx": self._current_idx
        }
```

It’s really the same idea, I’ll skip the explanation.

## Advanced Processing

Later in the pipeline, we’ll need to tokenize the text. This is rather a simple example. 

```python
class TokenizeNode(BaseNode[Dict]):
    """Base node for tokenization."""

    def __init__(
            self,
            source_node: BaseNode[Dict],
            tokenizer_name: str,
            max_len: int,
    ):
        super().__init__()
        self.source = source_node
        self.tokenizer_name = tokenizer_name
        self.max_len = max_len
        self.tokenizer = None  # Lazy initialization in reset()

    def reset(self, initial_state: Optional[Dict[str, Any]] = None):
        super().reset(initial_state)
        self.source.reset(initial_state.get("source_state") if initial_state else None)

        # Initialize tokenizer if not already done
        if self.tokenizer is None:
            self.tokenizer = AutoTokenizer.from_pretrained(self.tokenizer_name)

    def next(self) -> Dict:
        item = next(self.source)
        tokens = self.tokenizer.encode(
            f"{item['text']}",
            padding="max_length",
            max_length=self.max_len,
            truncation=True
        )
        item["input_ids"] = torch.tensor(tokens, dtype=torch.long)
        return item

    def get_state(self) -> Dict[str, Any]:
        return {
            "source_state": self.source.state_dict()
        }
```

## Complete Dataset Node: `HahaDatasetNode`

```python

class HahaDatasetNode:
    """Factory class for creating Haha dataset processing node."""

    LOCAL_PREFIXES = {
        "train": "/data/prescient-lm/keunwoo/training/text-data/haha/train",
        "val": "/data/prescient-lm/keunwoo/training/text-data/haha/val",
    }

    NUM_SHARDS = {
        "train": 10000,
        "val": 200,
    }

    NUM_LINES_PER_FILE = {
        "train": 2000,
        "val": 2000,
    }

    @staticmethod
    def _extract_text(item: Dict) -> Dict:
        """Extract text fields from JSON record."""

        # some text processing. like, 
        item["text"] = "\n\n".join([item['title'], item['body']])
        return item
    
    @staticmethod
    def _filter_non_text(item: Dict) -> bool:
        """Filter out records with no text."""
        return bool(item["text"].strip())

    @classmethod
    def create(
            cls,
            split: str,
            file_shuffle_buffer: Optional[int] = None,
            example_shuffle_buffer: Optional[int] = None,
            do_cycle: bool = True,
            tokenizer_name: str = "model_name",
            max_len: int = 2048 + 1,
    ) -> BaseNode:
        """Create a processing node for the Haha dataset.

        Args:
            split: Dataset split ('train', 'val', or 'test')
            file_shuffle_buffer: Buffer size for shuffling files
            example_shuffle_buffer: Buffer size for shuffling examples
            do_cycle: Whether to cycle through the dataset indefinitely

        Returns:
            BaseNode: A node that yields processed records
        """
        if split not in cls.LOCAL_PREFIXES:
            raise ValueError(f"Invalid split: {split}")

        if file_shuffle_buffer is None:
            file_shuffle_buffer = cls.NUM_SHARDS[split]

        if example_shuffle_buffer is None:
            example_shuffle_buffer = cls.NUM_LINES_PER_FILE[split]

        # Set random seed for training
        if split == "train":
            seed = int(time.time_ns()) % (2 ** 32)
            set_all_seeds(seed)
        else:
            rank, _ = get_rank_and_world_size()
            seed = 13579
            set_all_seeds(seed + rank)

        # Initialize file listing node
        base_path = cls.LOCAL_PREFIXES[split]
        node: BaseNode = LocalFileListNode(base_path, ["**/*.jsonl", "**/*.json"])
        # Add shuffling for training files
        if split == "train":
            node = ShuffleNode(node, buffer_size=file_shuffle_buffer, seed=seed)

        # Add cycling if requested
        if do_cycle:
            node = CycleNode(node)

        # Add JSON reading
        node = JsonLinesReaderNode(node)

        # Add text extraction and filtering
        node = Mapper(node, cls._extract_text)
        node = FilterNode(node, cls._filter_non_text)

        # Add example shuffling for training
        if split == "train":
            node = ShuffleNode(node, buffer_size=example_shuffle_buffer, seed=seed)

        # Add tokenization
        node = TokenizeNode(
            node,
            split=split,
            tokenizer_name=tokenizer_name,
            max_len=max_len
        )

        # Add metadata
        node = AddMetadataNode(node, "dataset/name", "haha_dataset")
        node = AddMetadataNode(node, "dataset/task", "pretrain")

        return node
```

- For this hypothetical, `Haha` dataset, we have 10000 jsonl files for training, each has 2000 lines.

In `create()` :

- The random seed part is simple — We want to make sure they are seeded always differently across GPUs. For `val` though, we want it to be consistent over epochs, while different across GPUs.
- Then we use `LocalFileListNode` to start the pipeline!
- I omitted `ShuffleNode` and `CycleNode` . These are also my custom nodes. After this, the jsonl file names are fully shuffled and will repeat indefinitely.
- Then the file names are passed to `JsonLinesReaderNode`.
- `Mapper` is an official node. It maps the function to each item.
- `FilterNode` is my custom that filters out items.
- I apply `ShuffleNode` once again. This time, it is applied to each item (corresponding to each line of jsonl).
- Finally, the text is tokenized in `TokenizeNode` .
- Even more finally, my custom `AddMetadataNode` takes a dict and add item into the metadata.

## Loader, or `Loader`.

Ok so really finally! How do we use this?

```python
from torchdata.nodes import Loader

node = HahaDatasetNode.create(split="train", max_len=max_len)
node = Batcher(node, batch_size=batch_size)
node = Mapper(node, collate_fn)
tr_loader = Loader(root=node, restart_on_stop_iteration=True)

# .. later in the code..
# e.g., if you're using Lightning:

trainer.fit(model, tr_loader)
```

This is it! It works! 

# 4. Discussion

Even after skipping some of the custom node classes, this example already involves quite a few preprocessing nodes. Imagine you have 10 different (heterogenous (..messy!)) data sources. Once you have all the essential and modular nodes, the heterogeneity is not a problem — as opposed to implementing 10 different `Dataset` classes.

The `Loader` class already works, but it is minimal. Torchdata also has a `StatefulDataLoader` and it is supposed to work with `Node`, but I had some issue with it. I’m sure that it will be fixed and improved in the next versions though. According to their design principle, `Node` should also work with `torch.utils.data.DataLoader` . But as of now, this seems to be implemented later.

I didn’t have it in this example, but `Prefetcher` Node is already implemented too. I skipped it because I also had an issue with it with the current version. Currently, it is based on a single-threaded mapper. They would have a good reason but I’m not sure why exactly.

The `torchdata.nodes.Mapper` is — like all the other provided nodes — single-threaded. For parallel processing, check out `torchdata.nodes.ParallelMapper` . 

Well, are you excited for Torchdata now? Hope you join me and enjoy the benefit of composable, modular data loading. Happy training!

[Keunwoo Choi](https://keunwoo.ooo) at Genentech, 2025 Feb.