# Domain docs

This project uses a single-context domain documentation layout.

## Before exploring, read these

- `GLOSSARY.md` at the project root.
- Relevant ADRs in `docs/adr/` that touch the area being explored.

If these files do not exist, proceed silently. Domain-modeling workflows create them lazily as terms or decisions are resolved.

## File structure

```text
/
├── GLOSSARY.md
└── docs/
    └── adr/
        ├── 0001-<decision-slug>.md
        └── 0002-<decision-slug>.md
```

## Use the glossary's vocabulary

When naming a domain concept in an issue title, proposal, hypothesis, test, or implementation, use its defined glossary term. If a needed concept is absent, reconsider whether it is part of the project's vocabulary; record a genuine gap for domain modeling.

## Flag ADR conflicts

If a proposal or implementation contradicts an existing ADR, identify the ADR and explain why the decision should be reopened rather than silently overriding it.
