---
description: Runs Artillery load tests, records baseline and optimized results, compares performance, and formats findings as resume-ready bullet points.
---

I want to run a load test and record results.

Steps to follow:
1. Check that the Artillery config file exists at /load-tests/scenario.yml — create it if missing
2. The test scenario must hit POST /check-rate-limit with varied userIds to simulate real traffic
3. Run a baseline test first and save results to /load-tests/results/baseline.json
4. After any optimization, run again and save to /load-tests/results/optimized.json
5. Compare the two results and summarize: requests/sec, p99 latency, error rate
6. Format the summary as resume-ready bullet points