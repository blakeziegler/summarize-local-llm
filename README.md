# Indiana University Change Lab - Custom Summarization Grader

### Introduction
This repository contains a full-stack custom summarization grader engineered for the Indiana University Change Lab built on the JsPsych framework.

### Summarization Components
**1. Reference Summary Generation and Comparison**
A "gold standard" summary is generated using Facebook's BART-CNN model:

```
ref_out = summarizer(
    passage,
    max_length=256,
    min_length=100,
    num_beams=4,
    length_penalty=1.2,
    early_stopping=True,
    do_sample=False,
)
reference = ref_out[0]["summary_text"].strip()
```

The reference and student summary are embedded wwith all-mpnet-base-v2:

```
emb_ref = embedder.encode(reference, convert_to_tensor=True)
emb_pred = embedder.encode(prediction, convert_to_tensor=True)
ref_cos  = util.cos_sim(emb_ref, emb_pred).item()
reference_similarity = ((ref_cos + 1) / 2) * 100
```

**2. Context Similarity**
Context similarity is used to ensure the student retained core content by comparing it to the original passage:

