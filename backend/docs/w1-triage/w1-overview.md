This document outlines the strategic redesign of **Workflow 1: Interview Decision (Triage)**. It replaces all prior specifications for this workflow, prioritizing a fast-pass, evidence-based triage process that meets the sub-2-minute SLA.

---

# Workflow 1: Interview Decision (Fast-Pass Triage) Strategy

### 1. Core Philosophy

The redesign of Workflow 1 is governed by four principles:

* **Evidence over scores:** We never output raw numerical scores. The system provides plain-language, evidence-based summaries.


* 
**Sub-2-Minute SLA:** The pipeline must deliver an "Interview Decision" within 120 seconds, avoiding heavy, slow operations like recursive repository cloning.


* 
**Plain Language Output:** The assessment must be readable by HR and Recruiters without requiring engineering expertise.


* 
**Explicit Unknowns:** The system labels gaps in public data (e.g., "insufficient public evidence") and never infers a negative from the absence of information.



### 2. Hybrid Extraction Architecture

To achieve speed without sacrificing semantic quality, we implement a parallel "Hybrid Attack":

* 
**The Macro (ClickHouse/GH Archive):** Queries pre-aggregated data to retrieve high-level lifetime stats (e.g., 3+ years of activity, dominant languages, PR velocity) in under 2 seconds.


* 
**The Micro (GraphQL Sniper):** Executes a single, highly optimized GraphQL request using the client's OAuth token to fetch the most recent semantic data (READMEs, manifest files, and the last 60 commit messages) from the candidate's most active repository.



### 3. Workflow Features & Pipeline Stages

The pipeline processes the candidate through three sequential stages before reaching the user:

1. 
**Zero-Clone Data Gathering:** Parallel retrieval of metadata from ClickHouse and the single-repo "Sniper" fetch.


2. **LLM Evaluation:** The hybrid payload (Macro stats + Micro commit/README text) is passed to a fast-reasoning LLM (e.g., Gemini 1.5 Flash). The prompt is constrained to generate a structured, plain-language scorecard.


3. 
**UI Handshake:** The backend returns an initial skeleton payload containing ClickHouse data immediately, while the LLM background worker finalizes the semantic summary (updated via WebSocket/polling).



### 4. Output Expectations (The Triage Scorecard)

The final output is segmented to meet the needs of the hiring funnel:

* 
**Layer 0 (Recommendation):** A one-line decision (e.g., "Interview Recommended," "Proceed with Caution").


* 
**Layer 1 (Executive Summary):** A 1-minute read that explains the recommendation using specific observed evidence (e.g., "Candidate shows strong expertise in trading systems; evidenced by orderbook implementation and Pyth feed integration").


* 
**Enterprise Fallback:** Profiles with low public volume but high organizational/account age are flagged as "Probable Enterprise Developer" to avoid false negatives.



### 5. Caching & Scalability

* 
**TTL:** All generated candidate profiles are cached for 14 days.


* 
**Auth:** All live requests are routed through the client's provided OAuth token to ensure compliance with GitHub rate-limiting policies.



---