# Research implementation, September 2026

Reference: user-supplied `safe route ai.pdf` (60 pages).

## Dataset decisions

| Research source | Integration | Remaining constraint |
| --- | --- | --- |
| PMC ward streetlights, pp. 13–15 | 15 published ward rows preserved in `backend/data/pmc_streetlights_source.json`; interactive ward explorer | Observation year absent. Reported lights/km differs from calculated poles/km. No verified ward polygons or automatic reassignment to road edges. |
| OpenStreetMap, pp. 16–20 | Existing graph and amenities retained; corrected category icons and escaped external marker labels | Snapshot coverage varies; lamp operation and hospital availability need field verification. |
| iRAD, p. 11 | Existing modelled grid retained | Official project page does not provide a downloadable record-level Pune export: https://pune.gov.in/en/i-rad-project/ |
| IJCRT / SPPU paper, p. 12 | Methodology reference | Paper: https://www.ijcrt.org/papers/IJCRT2606353.pdf . Published model metrics belong to the authors. A paper is not a machine-readable training dataset. |
| NHAI / Zenodo, p. 12 | Source assessed; excluded from city edge scoring | https://zenodo.org/records/7773156 covers Pune–Solapur NH-9 km 144.4–249 (2013–2018) and a separate eastern-India corridor. Chainage is not Pune city GPS. |
| RASSI, p. 13 | Research reference | Publications do not establish access to a reusable crash microdataset. |
| Navale study, p. 13 | Pending identifiable source | PDF does not provide an exact publication link; quoted casualty counts were not imported. |
| Open-Meteo, additional external data | Departure-hour Pune rain and visibility in the app | City-centre forecast, no street flood prediction; advisory only, no RSS modification. |

Weather API documentation: https://open-meteo.com/en/docs . Only the public Pune city-centre coordinate is sent; traveller coordinates are not sent. A failed forecast request displays unavailable, and departures outside the returned time range display out-of-range.

The PDF presents conflicting weight alternatives, approximate formula examples, and hypothetical integrations. Implementation retains the project's calibrated weights. Pages 38–41 support the existing five-factor score; pages 49–56 support the existing incident corroboration workflow. Automated emergency SMS, predictive crime models, and guaranteed emergency response times are not implemented.

## Run locally

From the project root, run `.venv\Scripts\python.exe -m backend.api.server` in one terminal and `npm run dev` in another. OSMnx is needed for graph rebuilding, not for the runtime routing server. The source lighting data is bundled so its explorer remains available without the API. Weather requires internet.
