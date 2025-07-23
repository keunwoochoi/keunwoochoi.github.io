# Reading Voxtral

# 1. Overview

[Voxtral](https://arxiv.org/abs/2507.13264) is the first audio model(s) by Mistral. It has two open-weight models: 3B and 24B. 32K context window (=40 minutes long).

# 2. Modeling
## 2.1 Audio Encoder
They used the Whisper large-v3 architecture. This is a cross-attention model with 1.55B params. The encoder and decoder share many hyperparameters: for the large model, both have 32 layers, 1280 hidden dim, 20 heads. Note that in Voxtral, only the encoder part is used. Some clarification: the Whisper paper mentions 80 mel bins, but that's perhaps about the previous versions. [Whisper v3](https://huggingface.co/openai/whisper-large-v3/blob/main/config.json#L42) uses 128 mel bins, same as in Voxtral. In Voxtral, the sample rate must be 16 kHz, as they specify 160 hop-length; and after 2x temporal downsampling (in the early conv 1d layer with kernel size=3, stride=2), the audio embedding is calculated at 50 Hz.

They have a receptive field of 30 seconds; longer signals are simply split into non-overlapping 30s regions, with the positional embedding being reset. Released in 2022, Whisper uses sinusoidal positional encoding. Perhaps, at least in this use case with maximum context length = 30 seconds x 50 Hz = 1500 time steps, the sinusoidal positional encoding is good enough. 

It's really interesting that not padding the audio to 30s resulted in performance degradation; hence short audios are always zero-padded. In 5.1, it shows the word error rate (in ASR) — not padding is slightly worse in French (but not in English). See the image below.

![Voxtral ASR performance with and without padding](Fig7.png)

Based on this, I actually suspect something was wrong with the "FLEURS fr" run in the "Not padded" case during the experiment. I'm sure the authors also suspected all of these, but:

- The loss curve is too noisy in general
- For FLEURS fr, the training between x=0.32 to x=0.68 (36% of the whole training) is used to recover. Other curves also have some fluctuations but not this bad! I wouldn't take this too seriously; something feels off. 
- In each chart, the two curves seem too uncorrelated to me, which makes me suspect whether the training data loader was really reproducible (To be honest, I also don't always do that.)

This speculation is fundamentally because the encoder structure has little reason to be dependent on padding. The padded silent regions would be involved during self-attention, and I'd love to look into the actual activation pattern with/without padding. That said, if padding indeed simply changes the audio embedding, whoa, too bad. 

## 2.2 Adapter Layer

This adapter layer has three linear layers. The first one is an MLP downsampler: [Code](https://github.com/huggingface/transformers/blob/main/src/transformers/models/voxtral/modeling_voxtral.py#L451).
```python
    def get_audio_embeds(self, input_features):  # melspectrogram
        audio_outputs = self.audio_tower(input_features)
        audio_hidden_states = audio_outputs.last_hidden_state
        audio_hidden_states = audio_hidden_states.reshape(-1, self.config.audio_config.intermediate_size)
        audio_embeds = self.multi_modal_projector(audio_hidden_states)
        return audio_embeds
```
The `intermediate_size` (5120) is 4 x `last_hidden_size` (1280). 

This makes the LLM perform at 50/4 = 12.5 Hz. This is because it performed the best on Llama QA while performing comparably on ASR. The authors add this:

>  We hypothesize that at 12.5 Hz, each audio-embedding encodes a similar amount of information as a text-embedding in the language decoder backbone, leading to superior understanding performance

I found this interesting. There are some assumptions:
- LLMs perform the best (on analysis tasks) when the input data is tokenized into units with evenly distributed information.
- 12.5 Hz might be the most optimal rate for this.

Let's investigate this. First, 12.5 Hz = 8 timesteps per second. The authors tested 6.25, 12.5, 25, 50 Hz --> 4, 8, 16, 32 timesteps per second.

[Llama QA](https://arxiv.org/abs/2305.15255) is an English-only spoken QA dataset. According to Gemini...
> The average speaking rate in English is about 3-4 syllables per second
which is...
> ~ 150 to 200 words per minute. 

That's 2.5 to 3.3 words, or just the middle: 2.9 words/second. Applying the general rule of thumb of a single word = 1.3 tokens, it translates to 3.77 tokens/second. 

![Effect of Downsampling](Fig8.png)

Let's look at the graph again. On Llama QA, the final performance is ranked as 12.5 Hz > 6.25 Hz > 50 Hz > 25 Hz. Again, this is quite noisy, and why should we only take the final performance as the true evaluation? But after enough training, 12.5 Hz shows a good lead, so okay. Then we have this question: well, 12.5 Hz is 8 timesteps per second — which is way over 3.77 tokens per second. 6.25 Hz is rather much closer to that.

But I still think they made a valid point. In [Sukjun Hwang, Brandon Wang, and Albert Gu's recent work on HNet](https://goombalab.github.io/blog/2025/hnet-future/), the authors/Albert hypothesize about the abstraction level of Transformers and sequence models in general; that Transformers work the best when the input sequence is at a meaningful abstraction level. 

Another issue: Based on the Voxtral paper,
> To reduce decoder computation and memory, we insert an MLP adapter layer that downsamples the audio embeddings along the temporal axis. 

The authors did not change the melspectrogram parameters: they only changed the downsampling in the MLP adapter layer.

See [the Whisper feature extractor (that computes the melspectrogram)](https://github.com/huggingface/transformers/blob/main/src/transformers/models/whisper/feature_extraction_whisper.py)

```python
        sampling_rate=16000,
        hop_length=160,
        n_fft=400,
```

which is used as is in [`processing_voxtral.py`](https://github.com/huggingface/transformers/blob/main/src/transformers/models/voxtral/processing_voxtral.py) (and I believe these parameters are pretty much standard in speech processing.) So...

`n_fft` is also the STFT window size; and it is 25ms (=40 Hz) with hop being 160 (10ms); so one frame is 25ms, two frames are 35ms, three are 45ms, etc. In the Voxtral audio encoder, there are i) 2x downsampler in Whisper encoder, and ii) 4x downsampler in adapter. This makes a single "timestep" from the audio to the LLM equal to (25 + (8 - 1) * 10 =) 95ms. (Their 12.5 Hz rate is still correct, as the 10ms hop remains even with the downsampling in the model.)

I still don't have any great conclusion from this, but it's nice to calculate the exact frame size in the LLM. And this 12.5 Hz rate (with a **95ms** frame) worked better than 6.25 Hz rate (with a 175ms frame), 25 Hz rate (with a [25 + (4 - 1) * 10 =] 55 ms frame), or 50 Hz rate (with a [25 + (2 - 1) * 10 =] 35 ms frame). 

Wow! I spent a lot on this, as if people care about audio... *haha!*

# 3. Methodology

## 3.1 Pretraining

- (Audio, Text) pairs are used to learn the speech recognition task
- (Audio, Text, A, T, A, T...) interleaved pattern is used to mimic QA/conversation across modalities. 
- Special tokens were used to specify different tasks and modalities.


## 3.2 Supervised Finetuning
- Audio context + Text query
- Audio input + text answer
    - TTS models were used
    - ASR data too, because using only TTS data leads to poor generalization over various speech (especially on accents)

## 3.3 Preference Alignment
- DPO
- Online DPO, where...
> sample two candidate responses from the current policy...
> ... replace the audio with its transcription, and leverage a text-based reward model...

Thus, this training worked as it would have worked for text data.

> Although the reward model only has access to the audio transcription - rather than the raw audio itself - it is able to capture semantics, style, and factual coherence from this information

I.e., this surely doesn't cover the audio-specific preferences. 


## 3.4 Evaluation

Nothing too different from typical LLM benchmarks. This is because benchmarks are measured by how the LLM responds, and Voxtral still outputs text only. 

# 4. Results

You'd rather check out [the paper](https://arxiv.org/pdf/2507.13264) and see the graphs on:
- ASR
- Speech translation
- Speech understanding
- Text benchmarks.

These are all valid, but I wish they also evaluated the same benchmarks while only switching the input modality between audio and text. This would provide results that isolate how the audio encoder is adapted into the text LLM.

# 5. Analysis

I already covered 5.1 (on padding) and 5.2 (adapter downsampling). 

## 5.3 Pre-training Patterns

Looks like 50:50 of ASR and Interleave is a pretty nice mixture, achieving good performance on both tasks.

# Conclusion

Yay ~ ~



