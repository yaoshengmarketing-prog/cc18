# CC18 review critic contract

Evaluate the draft against `config/review-policy.json` and `config/review-scorecard.json`. The source record is authoritative. Do not reward elegant unsupported claims.

Also validate all three title layers against `config/title-policy.json`: exact source preservation, source-signal coverage in the display title, and search-intent coverage in the SEO title.

Return JSON with all scorecard dimensions, weighted overall score, unsupported claims, repeated ideas, phrases that could be reused for another work, missing search terms, rewrite instructions and `rewrite_required`.

Set `rewrite_required` when any publication threshold fails. A rewrite must address the listed defects and be scored again. After the configured retry limit, keep the work as draft rather than lowering the threshold.
