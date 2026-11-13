<!-- flowstate-continue v1 -->
# Picking a vector database for a 10M-document RAG app

> We compared managed and self-hosted vector stores for a retrieval app that will grow to about 10 million documents. We settled on starting with Postgres + pgvector and planning a move to a dedicated store only if p95 latency or recall falls short.

## Q: Do we even need a dedicated vector database at our scale?
Probably not at first. At 10M embeddings of 1,024 dimensions, pgvector with an HNSW index fits on one large Postgres instance and keeps vectors next to the relational data we already filter on. A dedicated store starts to pay off at roughly 50M or more vectors, or when we need multi-tenant isolation that is hard to model in Postgres.

### Follow-up: What breaks first if we stay on Postgres too long?
Index build time and memory. HNSW indexes have to fit in RAM for good latency, and rebuilding them after a schema or model change can take hours.

### Data: Memory needed for the HNSW index at 10M vectors
- value: ~48 GB
- context: 10M × 1,024 dims × 4 bytes, plus graph overhead of about 15%
- source: our back-of-envelope estimate

### Steps: Why latency degrades as the corpus grows
1. Corpus grows past RAM — index pages start hitting disk
2. Disk reads rise per query
3. p95 latency climbs, especially with filters
4. We raise ef_search to hold recall — latency climbs further

## Q: How do the main options compare?
We looked at four options for cost, filtering and operations work. The managed options trade cost for less operations work. Self-hosted Qdrant was the best dedicated option if we ever need one.

### Table: Vector store comparison
| Option | Hosting | Metadata filtering | Est. monthly cost at 10M | Ops burden |
|---|---|---|---|---|
| pgvector | Our Postgres | Full SQL | ~$400 | Low (existing) |
| Qdrant | Self-hosted | Rich payload filters | ~$350 + ops time | Medium |
| Pinecone | Managed | Good | ~$700 | Very low |
| Weaviate Cloud | Managed | Good, GraphQL | ~$600 | Low |

### Debate: Is managed worth the premium?
- For: Pinecone removes index tuning and scaling work entirely (your view, early on)
- Against: We already run Postgres well; a second datastore doubles the backup, auth and incident surface (my view)

### Sources
- [pgvector README](https://github.com/pgvector/pgvector) — HNSW and IVFFlat index options
- [Qdrant documentation](https://qdrant.tech/documentation/) — payload filtering

## Q: How should we measure whether retrieval is good enough?
Track recall@10 against a hand-labelled set of 200 queries and p95 latency under realistic filters. Re-run both whenever the embedding model changes.

### Term: recall@10
The share of the truly relevant documents that appear in the top 10 results.

### Quote: The rule we agreed on
> If recall@10 drops below 0.9 or p95 goes over 150 ms with filters, we revisit the store.
— me

## Open threads
- [ ] Benchmark pgvector HNSW with our real filter mix
- [ ] Price Qdrant Cloud against self-hosting
- [ ] Decide whether to quantize embeddings to int8

## Decisions
- [x] Start on Postgres + pgvector with an HNSW index
- [x] Build the 200-query labelled evaluation set before launch

## Sources
- [pgvector](https://github.com/pgvector/pgvector)
- [Qdrant documentation](https://qdrant.tech/documentation/)
- [Pinecone pricing](https://www.pinecone.io/pricing/)
