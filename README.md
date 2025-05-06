# Indiana University Change Lab - Custom Summarization Grader

### Introduction
This repository contains a full-stack custom summarization grader engineered for the Indiana University Change Lab built on the JsPsych framework.

### Summarization Components
**1. Reference Summary Generation and Comparison** \\
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

The reference and student summary are embedded with all-mpnet-base-v2:

```
emb_ref = embedder.encode(reference, convert_to_tensor=True)
emb_pred = embedder.encode(prediction, convert_to_tensor=True)
ref_cos  = util.cos_sim(emb_ref, emb_pred).item()
reference_similarity = ((ref_cos + 1) / 2) * 100
```

**2. Context Similarity** \\
Context similarity is used to ensure the student retained core content by comparing it to the original passage:

```
emb_ctx = embedder.encode(passage, convert_to_tensor=True)
ctx_cos = util.cos_sim(emb_ctx, emb_pred).item()
context_similarity = ctx_cos * 50 + 50
```

**3. Length Penalty** \\
The length Penalty is added to discourage responses that are too short or too long based on length ratio between the summary given and original text:

```
    ref_len = len(reference.split())
    pred_len = len(prediction.split())
    if pred_len < 20:
        length_penalty = 15
    else:
        ratio = pred_len / ref_len if ref_len > 0 else 0
        if ratio < 0.15:
            length_penalty = 15
        elif ratio < 0.25:
            length_penalty = 10
        elif ratio < 0.35:
            length_penalty = 5
        elif ratio > 0.65:
            length_penalty = 5
        elif ratio > 0.75:
            length_penalty = 10
        else:
            length_penalty = 0
```

**4. Grammar Penalty** \\
We use the Python language tools to detect grammar violations. We compute errors per 100 words and apply a 1 point error for each, with a max deduction of 20 points:

```
    matches = grammar_tool.check(prediction)
    errors_per_100 = len(matches) / (pred_len / 100) if pred_len > 0 else len(matches)
    grammar_penalty = min(int(errors_per_100 * 1), 20)
```

**5. Final Calculation** \\
The final score is calculated by taking the average of the two similarity scores, and deducting the length and grammar penalties:
```
    raw_score   = 0.5 * reference_similarity + 0.5 * context_similarity
    interim     = round(raw_score)
    final_score = max(0, interim - length_penalty - grammar_penalty)
```

### To-Do
- Fix random Prompt generation from Context -> Prompt
- Log the scoring breakdown on the backend and export to csv
- Create client-facing error messages based on score breakdown
