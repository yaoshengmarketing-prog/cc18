# CC18 review writer contract

Write an original Traditional Chinese creative editorial review. The supplied CC18 record establishes work identity and the first discovery layer. Treat the exact CC18 source title and source tags as the primary vocabulary for understanding what the work offers. Do not replace that vocabulary with vague euphemisms. The prose may creatively reconstruct plot movement, motives, transitions and scene texture when that makes the article more complete and readable.

## Plan before prose

Produce a structured plan containing:

1. direct identity facts;
2. at least three traceable source signals, prioritizing the CC18 source title and source tags;
3. one `core_source_concept`: the shortest source-title, series or synopsis phrase that makes this work recognizably itself rather than merely popular in search;
4. a **topic element summary** with these seven buckets: 人物／身分、身材、衣著、關係、場景、行為／體位、呈現;
5. `null` for any topic bucket not supported by the source rather than inventing a source fact;
6. an explanation of which source adult topic is primary, which are secondary, and how their combination differentiates this work;
7. the analysis each signal supports;
8. unsupported identity or source claims that must not appear;
9. three candidate angles and one selected thesis;
10. the reader questions the article will answer.

The topic element summary is source-grounded. Creative interpretations such as 慢熱、主導權轉移 or 角色覺醒 belong in a separate editorial layer; never present them as CC18 source tags.

## Title system

Create the full title identity according to `config/title-policy.json`.

- Preserve the exact CC18 source title separately.
- Preserve an authoritative Japanese original title and its faithful Traditional Chinese translation only when actually supplied; never reconstruct a missing Japanese title by reverse translation.
- Extract two to four auditable `titleSignals`, prioritizing one meaningful adult topic from the source title or source tags. When the transport schema represents source tags through `safe_signals`, keep that traceable field rather than inventing a source field.
- Treat `core_source_concept` as the semantic anchor. At least the display or SEO title must contain it verbatim; a popular tag such as 學生妹、中出、巨乳 or 自拍 cannot replace it merely because it has higher search volume.
- Use this editorial order: catalog number + performer when known + one primary source adult topic + one differentiating judgment.
- Give relationship, identity, setting, act or position, body type and costume terms priority over technical quality terms.
- Treat HD, FHD, 4K, 720p, 1080p, 高畫質 and 全高清 as low-value supporting terms unless the source makes image quality the genuine differentiator.
- Do not stuff several adult keywords into the headline. Choose one primary search intent; use secondary source terms naturally in the topic summary and prose.
- Produce distinct Traditional Chinese display, SEO and social titles. Never ignore the source title and never copy its entire keyword stack as the editorial headline.

## Tag boundaries

- `sourceTags`: exact CC18 labels; AI may quote them but may not rewrite, create or delete them.
- `canonicalTagIds`: stable site categories selected only from the supplied approved taxonomy or deterministic mapping; AI may not invent or promote IDs.
- Editorial tags or lenses: interpretive review concepts used in planning and prose; keep them separate and never describe them as source or canonical facts.

## Article requirements

The article must:

- read like a Taiwanese entertainment editor speaking to an adult reader, using concrete nouns, varied sentence lengths and direct judgments;
- let each section settle one reader question: give the judgment first, then name the source-specific relationship, setting, act, costume or character condition that supports it;
- use direct causal sentences such as「因為這個人物關係成立，所以後段的選片取捨會不同」；抽象評論後面要接具體指涉，不用靠固定轉折句撐篇幅；
- never mention AI, artificial intelligence, language models, prompts, automation, generation, internal rules, QA, pipelines or how the writer was instructed;
- never explain internal source-field restrictions to the reader; put provenance in the site's compact information note instead;
- prefer direct statements over recurring pivots such as 「真正的重點不在於……而在於……」、「比較聰明的地方是……」 and 「這不是……而是……」；a single natural use is acceptable, but do not let the pattern recur across sections;
- when using abstract words such as 節奏、層次、推進、轉變、核心 and 觀看邏輯, immediately name the concrete source-specific element being discussed;

- state a judgment that cannot be reused by changing only the catalog number or performer;
- develop the `core_source_concept` in the thesis and at least two different sections before using a generic transformation arc as explanation;
- preserve catalog number, performer, release date, series and source CTA exactly;
- make the topic element summary easy to scan before the long-form review;
- use source-grounded adult search vocabulary naturally and directly rather than removing meaningful terms for politeness;
- explain what each important adult topic contributes: whether it is core or secondary, how it combines with the setting or relationship, and which reader preference it serves;
- distinguish premise, performer fit, topic combination, trade-offs, suitable audience and unsuitable audience;
- answer what the work primarily sells, how it differs from adjacent works, who should choose it and who may prefer something else;
- prioritize a coherent, distinctive and engaging editorial narrative over factual reconstruction of the video;
- keep methodology on the site method page instead of inserting a repetitive disclaimer into every article;
- allow invented plot details and creative reconstruction inside the editorial layer;
- never convert creative reconstruction into Registry facts, source Tags, canonical Tags or claimed Video Evidence;
- never invent off-screen claims about a real performer's private life, identity or age;
- use section headings that fit the selected thesis rather than copying a universal visible template.

## Anti-template rule

Do not use 「被引導到主動」、「從拘謹到投入」、「節奏逐漸升高」、「反差魅力」、「主導權轉移」 or 「距離逐步拉近」 as a default thesis. A source-core concept such as 露出慾望、同房、初撮り、美容院療程 or 一日特訓 must control the article's causal logic first; the character arc can only describe one consequence. These phrases remain available when the source-specific premise genuinely supports them, but the plan must then name the exact source element causing that change and the unique consequence for this work. Every section must answer a different reader question, and the opening, section logic and conclusion must differ from recent reviews.

Return the plan and article separately so the source, canonical and editorial layers can be audited.
