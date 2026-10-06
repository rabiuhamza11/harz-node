# HARZ Offline Reader v0.3 — SCALE BUILD (Oct 6, 2026)

Owner order: "Scale it" — 10k+ pages. Delivered: 11,430 pages, 123.7M chars.
Every page FULL-LENGTH. No truncation anywhere in the pipeline.

## Two sealed artifacts

1. POCKET (for your phone, 2GB RAM):
   Download `harz-reader-v03-pocket.tar.gz` from the release assets.
   1,267 pages | 18.5MB corpus | boots in under a minute on Termux.
   Selection is by DOCUMENT (news + HARZ + mid-size wiki), never by truncation.

2. FULL (workbench / bigger devices):
   `corpus-v03-full.tar.gz` — 11,430 pages | 135MB corpus | NOT for 2GB phones.

## Install (Termux)

    curl -L -C - -o harz-reader-v03-pocket.tar.gz <release asset URL>
    tar -xzf harz-reader-v03-pocket.tar.gz -C harz-reader-v03 && cd harz-reader-v03
    bash start-reader-v03-pocket.sh
    # open http://127.0.0.1:8801/ — then airplane mode still works

## Seals (fail-closed — reader refuses tampered corpora)

- Full corpus file sha256: a8cd74b832ce6cb306bbe6b9bf4784386128b508c685b90822a5380eee917d08
- Full engine digest: 6d4be34277659326394ae43d1fb41c454fb240b4721f01ce6e10b65e11de2f7c
- Pocket file sha256: 490688c136a05d053233d74046f2f72a469d9ecba17be0b5cac283739007d555
- Pocket engine digest: 142daf0b65c4f48d22ae2b10f74b09fdd9f30f3c3aa3eb1dac477491ce4992da

## Sources (honest)

- 361 news + HARZ pages (punch, businessday, nairametrics, premiumtimes, dailytrust, tribune, github.com/rabiuhamza11)
- 11,069 Wikipedia pages (Nigeria focus + tech/finance/agriculture/health/science)
- Skipped honestly: thisdaylive + thecable (JS shells, nothing extractable server-side)
- Longest article: Glossary of agriculture — 256,074 chars, served full-length
