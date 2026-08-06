# Top 5 critical trails (100-run batch)

**Method:** Worst evidence of product/Why bugs across all 100 runs (not “hard scenario”).  
**Sources:** `REPORT_DATA_AI_IMPROVEMENTS.md`, `EVAL_FIRST_15.md`, run JSONs.  
**Invent-after-perfect quantified in report:** 14 Whys; strongest wording = “many wrong answers.”

| Rank | Scenario | Outside first 15? | Bug type |
|---|---|---|---|
| 1 | `mix_014` | No | Invent “many wrong answers” after perfect MAIN |
| 2 | `mix_015` | No | Invent “many wrong answers” after perfect ENTRY |
| 3 | `mix_085` | **Yes** | Same invent-after-ENTRY severity (batch confirmation) |
| 4 | `mix_007` | No | Invent “moderate errors” + overclaim “after teaching” |
| 5 | `mix_003` | No | Assist on correct expand + invent “moderate errors” |

**Near-misses (pattern exemplars, slightly lower severity):** `mix_011` (overclaim “after instruction” after declines only), `mix_012` (“option 0” jargon), `mix_001` (“moderate errors and no help” after perfect MAIN).

Full owner-readable write-up: [`TOP_5_CRITICAL_EXPANDED.md`](./TOP_5_CRITICAL_EXPANDED.md).
