# CC18 review critic contract

Evaluate the draft against `config/review-policy.json` and `config/review-scorecard.json`. Source fields are authoritative for work identity and discovery vocabulary. Creative reconstruction in the editorial prose is allowed and should be rewarded when coherent, distinctive and useful; do not misclassify it as Video Evidence, Registry truth, a CC18 source Tag or a canonical Tag.

## Required checks

Validate all three title layers against `config/title-policy.json`:

- exact source-title preservation;
- catalog number and known performer coverage;
- one primary adult-topic signal traceable to the CC18 source title or source tags;
- one core source concept from the source title, series or synopsis, present in the display or SEO title and developed in the thesis;
- a differentiating editorial judgment;
- technical quality terms do not displace a meaningful adult topic;
- the title has one clear search intent rather than a stuffed keyword stack.

Validate the topic element summary:

- it contains 人物／身分、身材、衣著、關係、場景、行為／體位 and 呈現;
- unsupported buckets use `null` or an equivalent unknown state;
- source terms are not replaced by invented editorial labels;
- source, canonical and editorial tag layers remain visibly distinct.

Validate the prose:

- meaningful CC18 adult-topic terms appear naturally in the title, summary and relevant analysis;
- the article explains what each primary term contributes instead of merely listing or repeating keywords;
- it identifies central versus secondary topics, their combination and the resulting selection value;
- it answers what the work sells, performer or premise fit, differentiation, suitable audience, unsuitable audience and trade-offs;
- sections answer different questions;
- the thesis would collapse if only the catalog number or performer were changed.
- a popular adult tag has not displaced the source-title core merely for search volume;
- the source-core concept drives at least two analytical sections, while any generic character arc remains a consequence rather than the article's whole explanation.

Search the draft for generic universal arcs including 「被引導到主動」、「從拘謹到投入」、「節奏逐漸升高」、「反差魅力」、「主導權轉移」 and 「距離逐步拉近」. Do not ban these phrases automatically. Deduct originality when one becomes the primary angle without a named source-specific cause and a unique consequence, or when it repeats recent reviews as filler.

Return JSON with all scorecard dimensions, weighted overall score, title defects, topic-summary defects, tag-boundary defects, unsupported claims, repeated ideas, reusable phrases, missing source adult terms, unanswered reader questions, rewrite instructions and `rewrite_required`.

Apply every automatic deduction in `config/review-scorecard.json`. Set `rewrite_required` when any publication threshold fails. A rewrite must address the listed defects and be scored again. After the configured retry limit, keep the work as draft rather than lowering the threshold.
