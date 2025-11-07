# Roffice Hour Q2: Making a Narrative for Your Thesis

I don't know how general this problem is, but I could related. I also have no idea how others' situations look like, so this post will use my PhD student days as an example.

I started my PhD 2014 Oct. 3 years later, when I was starting working on my thesis, well, I was lucky to have several papers. But they also looked scattered rather than linear. They were:

- [group 1] some cnn/crnn/dataset papers about music tagging/classification
- [group 2] a paper about Kapre: keras audio processing layers
- [group 3] two about interpretability of deep music classification models
- [group 4] playlist generation using RNN
- [group 5] jazz chord/drum score generation using RNN

Apparently, I finished the thesis and got the degree. The content of [my thesis](https://qmro.qmul.ac.uk/xmlui/bitstream/handle/123456789/46029/CHOI_Keunwoo_PhD_Final_190918.pdf?sequence=1) was:

- intro
- background
- on the dataset, from [group 1] 
- CRNN paper, from [group 1]
- on audio input preprocessing, from [group 1]
- transfer learning, from [grpup 1]
- explanation of CNNs, from [group 3]
- conclusion

Apparently, I didn't include any work from the group 2/4/5. This means I chose my thesis to be consistent on the "research problem".

Instead, I could've chosen other variable as the constant, the theme of my thesis. For example, one can focus on the "tool" they've used. I used convnets a lot, and the explanation papers were about convnets, too. I could argue CRNN is also partially a convnet and include the CRNN paper. Kapre is an important tool for me, and it had the first spectrogram layers, which were useful for 2D convnets, so yeah, maybe.

Or, perhaps I could focus on the high-level relationship between music audio signals and deep learning architectures. Say, *how the sequential nature of music signals can be modeled by deep learning architecture*. Then I might have been able to squeeze the [group 4] and [group 5] papers, as a preliminary step to understand RNNs. 

I focused on my case as an example, but here's a summary. If you're thinking about linearizing your works into a thesis, that's likely your works are not clearly consistent over the "research problem" dimension. You can then focus on which "tools" you used. If that wouldn't work, I don't know, but there must be something consistent through your PhD years in your mind. Mine was "what can I do with deep learning on music???", which is consistent across all of my works that would look scattered from other perspectives. Move your viewpoint conceptually one step higher, until you have enough things under a single theme.

As usual - good luck!
