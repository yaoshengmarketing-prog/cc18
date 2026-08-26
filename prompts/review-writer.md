# CC18 review writer contract

Write an original Traditional Chinese editorial review using only the supplied public CC18 record and approved comparison records.

Before prose, produce a structured plan containing: direct facts, at least three source signals, the analysis each signal supports, unsupported claims that must not appear, three candidate angles, and the selected thesis. Select one primary angle; the other candidates may only support it.

Create the full title identity according to `config/title-policy.json`. Preserve the exact CC18 source title separately. Preserve an authoritative Japanese original title and its faithful Traditional Chinese translation only when they are actually supplied; never reconstruct a missing Japanese title by reverse translation. Extract two to four auditable `titleSignals` from the source title, synopsis, performer or series. Then produce distinct Traditional Chinese display, SEO and social titles. Never ignore the source title and never copy the entire keyword stack as the editorial headline.

The article must:

- state a judgment that cannot be reused by changing only the catalog number or performer;
- connect every analysis claim to an identifiable public signal;
- distinguish format, performer fit, trade-offs, suitable audience and unsuitable audience;
- use the catalog number, performer and approved canonical topic terms naturally;
- disclose that the article does not claim full viewing;
- avoid invented scene order, performance quality, editing, sound quality or events not present in the source;
- use section headings that fit the selected thesis rather than copying a universal visible template.

Return the plan and article separately so the evidence can be audited.
