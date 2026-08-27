# MRCTI National Water Utility Observatory

An interactive research dashboard for screening U.S. community water systems, examining model-relative outliers, and comparing recent and earlier drinking-water violation patterns.

**Live dashboard:** [https://jo67893whu.github.io/MRCTI-dashboard/](https://jo67893whu.github.io/MRCTI-dashboard/)

## Purpose

This dashboard translates selected findings and analytical outputs from the MRCTI water utility study into an exploratory, utility-level interface. It is designed to help researchers and policy users:

- screen community water systems using observed operational, socioeconomic, affordability, and violation indicators;
- identify utilities whose observed outcomes differ substantially from model expectations;
- compare recent five-year violation averages with the preceding five-year period; and
- review model performance and interpretability evidence used in the study.

The dashboard is a case-finding and research tool. It does not assign performance grades, establish causality, or recommend ownership changes, acquisitions, privatization, or other interventions.

## Analytical coverage

The dashboard distinguishes three nested analytical layers:

- **EMMA:** the national baseline of community water systems used for broad utility-level screening.
- **Public:** the subset matched to public financial records.
- **Private:** the subset matched to private financial information. Financial variables may be reported at company level even when water-quality records are associated with individual PWSIDs.

The national utility screen is organized by Public Water System ID (**PWSID**). Financial coverage is not available for every EMMA record.

## Dashboard modules

### Utility Screen

Filter and rank utilities by state, ownership, source, population, annual water charge, charge burden, health violations, total violations, and financial-data coverage. The map summarizes the geographic distribution of the active selection.

### Outliers & Trends

The model-relative screen currently covers two confirmed EMMA random-forest outcomes:

- average annual water charge; and
- 10-year health violations.

Residuals are calculated as:

```text
residual = observed value - out-of-fold predicted value
```

Predictions are generated using five-fold cross-validation. Large absolute residuals identify records furthest from the fitted regression surface. Positive residuals are above model expectation; negative residuals are below model expectation. The default extreme group is the top 5% by absolute residual.

The interim trends screen uses the PWSIDs currently available in `combinedscaled.xlsx`; national all-PWSID coverage is pending an additional dataset. It compares:

```text
recent annual average = five-year count / 5
preceding annual average = (10-year count - five-year count) / 5
change = recent annual average - preceding annual average
```

A negative change is labeled **Improved**, a positive change **Worsened**, and zero **No change**. These comparisons are descriptive. They do not demonstrate that ownership or an ownership transition caused the observed change.

### Model Evidence

Summarizes cross-validated model performance and selected report-era feature-importance and SHAP outputs. Model statistics should only be compared within the same outcome and analytical layer because samples and encoded feature sets differ.

### Data & Methods

Documents scope, variable definitions, data lineage, matching rules, and major interpretation limitations.

## Data notes and limitations

- EMMA does not contain a utility-name field for every PWSID. Names shown in the dashboard are matched from available public, private, combined, and AWWA source files; unmatched records remain labeled `Name unavailable`.
- The AWWA survey does not cover every national community water system.
- Ownership in the analytical files is not a verified year-by-year ownership history.
- Ten-year violations may include events occurring before a later acquisition or ownership change.
- Private financial information may be consolidated at company level, whereas violations are associated with PWSIDs.
- Missing financial fields mean that no corresponding financial record was available under the implemented matching rules.
- The reported revenue-to-expense ratio describes the available reporting-year fields. A value below 1 does not by itself establish financial distress.
- Extreme residuals are review candidates, not proof of good or poor management.
- Residual percentile thresholds are screening rules, not prediction or confidence intervals.

## Reproduced EMMA model checks

The dashboard's PWSID-level residual dataset reproduces the report-era random-forest cross-validation results:

| Outcome | Observations | CV R² | CV RMSE | CV MAE |
|---|---:|---:|---:|---:|
| Average annual water charge | 43,531 | 0.404 | 152.073 | 116.501 |
| 10-year health violations | 43,531 | 0.205 | 3.845 | 0.992 |

Minor differences beyond the displayed precision may result from rounding.

## Repository structure

```text
index.html             Main dashboard layout
app.js                 Filtering, charts, tables, maps, and interactions
styles.css             Dashboard presentation and responsive layout
data.js                Dashboard-ready utility records and model summaries
anomaly-data.js        EMMA out-of-fold predictions and residuals
trend-data.js          Recent versus preceding five-year violation measures
states-data.js         State geometry packaged for static hosting
states.geojson         Source state geometry
d3.min.js              Local D3 dependency
assets/                Model-evidence figures and supporting assets
```

## Run locally

No server-side application or database is required. The dashboard is a static site, but it should be opened through a local web server rather than by double-clicking `index.html`.

From the repository directory:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8765/
```

Stop the server with `Ctrl + C` in the terminal where it is running. The port number may be changed if `8765` is already in use.

## GitHub Pages deployment

This repository can be hosted directly with GitHub Pages because all dashboard resources are static.

1. Open the repository's **Settings → Pages**.
2. Select **Deploy from a branch**.
3. Choose the publication branch, normally `main`, and the folder containing `index.html`, normally `/ (root)`.
4. Save and wait for the deployment to complete.

When updating the site, replace the relevant files, commit the changes, and push them to the publication branch. After deployment, use a hard refresh if the browser still displays cached files.

## Responsible interpretation

Results should be used to identify cases for additional investigation. Any substantive conclusion about a utility should be checked against the underlying record, reporting period, ownership history, service-area context, and source-data limitations.
