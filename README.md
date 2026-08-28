# May Lab Mouse Prostate ADT Portal

Interactive spatial-transcriptomics portal for **GEO GSE295043** (Shelley, **May** et al.,
*Neoplasia* 2025 — spatiotemporal atlas of androgen deprivation in the mouse prostate),
built in the same **Explorer** chrome as the Aguado aortic-valve portal.

The link opens on **Live** — a cinematic walkthrough of the analysis with a streaming
console (see below). The **Portal** segment is the full interactive portal described
here, one click away and unchanged. The chrome is
an indigo gradient header with `Live / Portal / Insights / Report` mode segments, a
**Workspace** section rail on the left, a coordinated **multi-pane Vitessce grid** in
the center (Spatial + UMAP on top; Cell Sets + Gene List + Heatmap below), and the
analysis tabs on the right. Fully static: no backend, no API keys, no analytics.

## Contents
```
app.html                 self-contained portal (Plotly + marked from CDN)
vitessce.html            standalone coordinated multi-view (optional fallback)
data/
  vitessce/              per-section AnnData-Zarr + configs + index.json + vendored engine
  manifest.json          {samples:[...], meta:{sid,day,rep,slide,gsm,n_cells}, pathways, signatures}
  precomputed.json       per-section counts, marker genes, signature + pathway stats
  <sid>.json             {modality, spatial:[[x,y]], umap:[[x,y]], obs:{cell_type, niche, *_score, <pathway keys>}}
  <sid>.expr.json/.bin   quantized (uint8, gene-major) log-norm expression, 900 genes
  tissue/<sid>.jpg       cropped + display-enhanced H&E background, index.json = placement
  nhood.json             squidpy neighborhood-enrichment z-scores per section
  niche_summary.json     spatial-niche definitions (k-means over neighborhood composition)
  timecourse.json        per-section programme/composition means + day-20-vs-day-10 pseudobulk DE
  atlas*.json/.bin       Harmony-integrated 15,439-spot atlas, sub-states, pathways, LR axes, Moran's I
  h5ad/<sid>.h5ad        analysis-ready AnnData per section (+ index.json for the download list)
  sq_stats.json          precomputed squidpy statistics per section (the Spatial tab)
  graph/<sid>.json       6-NN spatial graph as index pairs, in portal spot order (Grid edges)
```

## Data
**8 10x Visium sections, 15,439 in-tissue spots, whole transcriptome (19,465 genes).**
C57BL/6 mouse prostate after orchiectomy, 4 biological replicates per timepoint:

| Group | Sections | Spots | Mean androgen score |
|---|---|---|---|
| **Castration day 10** | Slide2A–D | 8,479 | +0.36 |
| **Castration day 20** | Slide4A–D | 6,960 | −0.10 |

The timepoints are **not** in the GEO sample titles (both read "Castrated") — they come
from the series matrix characteristic `treatment: Castracted D10 / D20`
(`pipeline/series_matrix.txt.gz`). This is the dataset's only condition axis: there is no
intact control in the deposit.

- **Color by**: compartment, spatial niche, one of **7 signatures** (androgen response,
  luminal/basal identity, involution/apoptosis, stromal, immune infiltration, proliferation),
  or one of **17 pathway-activity** scores.
- **Compartments** are computational (Leiden + relative-enrichment marker scoring):
  luminal / basal epithelium, stroma / fibroblast, smooth muscle, endothelium, immune,
  urothelium, seminal vesicle. On Visium (55 µm, multi-cell) a label is the *dominant
  program* of a spot, not a cell-type call. Urothelium and seminal vesicle are kept as
  explicit classes because mouse prostate sections routinely include adjacent tissue.
- **Castration genes are guaranteed searchable in every section** (bypassing the HVG cap):
  `Tgm4`, `Pbsn`, `Sbp`, `Msmb`, `Nkx3-1`, `Ar`, `Fkbp5` (secretory/androgen), `Clu`,
  `Cdkn1a`, `Bax` (involution), `Krt5`/`Krt14`/`Trp63` (basal), `Upk1a`/`Upk2`/`Upk3a`
  (urothelium), `Chga`/`Syp`/`Ascl1` (neuroendocrine plasticity). A gene undetected in a
  section is carried as a flat-zero column so cross-section search stays consistent.

## Provenance & caveats — read before interpreting

This portal is an **independent Scanpy re-analysis, not a reproduction** of the paper.
None of the labels here are the paper's.

| | This portal | Paper |
|---|---|---|
| Toolkit | Scanpy, log1p, Leiden 1.0 | not reproduced here |
| Annotation | 8 marker-scored compartments per section | — |
| Integration | Harmony over the 8 sections (Atlas tab) | — |
| Cell composition | **no deconvolution** | — |

### The day-10 / day-20 contrast is confounded

The day-20 sections carry far less glandular prostate and much more urothelium, seminal
vesicle and stroma than the day-10 sections. Section-level pseudobulk DE separates the two
groups almost completely (**9,346 of 13,781 genes at FDR < 0.05**, n = 4 vs 4), which is
composition *plus* biology, not a clean timepoint effect. The direction is nonetheless the
expected one — `Tgm4` (−10.4 log2FC), `Azgp1`, `Ren1` and the rest of the secretory program
collapse by day 20 — but treat every delta in the **D10/D20** tab as descriptive.

### Other limits

1. **Visium spots are multi-cell** → no per-cell claims; all "compartment" labels are
   spot-level dominant programs.
2. **No deconvolution.** The Aguado portal's per-spot NNLS needs a matched single-cell
   reference; no mouse-prostate scRNA reference was used here, so the `prop_*` channels
   simply don't exist rather than being faked.
3. **No intact control** in this deposit — every section is castrated.
4. **Pathway scores are `score_genes` activities** (control-gene-corrected means), *not*
   permutation-tested GSEA/ORA. Δ-activity contrasts carry no statistical test.
5. **Ligand→receptor axes** in the Atlas tab are a CellChat-*style* co-expression heuristic
   (mean ligand in the top sender × mean receptor in the top receiver), not a permutation test.

## Live mode (the **● Live** segment) — cinematic preview + console

The default landing view once the abstract modal is dismissed. It is an overlay across
the workspace rows, so the Portal underneath is never rebuilt or disturbed by the switch.

**The preview.** Every spot is one particle on a 2-D canvas. A *layout* assigns each
particle a target position, colour and alpha; the render loop eases the current state
toward the target, so switching layouts *moves the same spots* rather than redrawing a
new chart. This dataset makes that literal: there is no separate scRNA modality, so the
integrated atlas **is** the 8 sections concatenated, and every atlas row maps back to an
exact spot. One particle therefore keeps its identity from the integrated UMAP all the way
to its real tissue coordinate and back. That mapping is derived from `atlas.obs.sample` at
runtime and each run length is checked against the section it claims to be — if anything
disagrees, tissue layouts are disabled rather than drawing spots at the wrong coordinates.

Layouts: integrated UMAP by compartment / subtype / day / section; one section at real
(x,y) by compartment, by any signature or pathway, or by any gene; two sections paired
under a shared scale; and **all eight sections tiled at once**, day 10 across the top row
and day 20 below, optionally painted by one score on a single shared colour scale.

**The console.** A terminal strip streams the pipeline as it runs (`▸` step, `✓` result,
`◆` finding, `⚠` caveat). Every number is computed at runtime from the same `data/*.json`
the Portal renders — spot counts from the manifest, compartment and subtype counts from
`atlas_meta.json`, day means and composition from `timecourse.json`, Moran's I and the
ligand–receptor axis from `atlas_meta.json` — so the console and the maps cannot disagree.
After the story ends it keeps narrating: any section switch, gene search, colour change or
tab change in the Portal prints a line.

**The story** (9 scenes, scrub / pause / restart): ingest → 8 compartments → the
androgen-dependent compartment (luminal secretory, 4,559 spots) → into Slide2B at real
(x,y) → paint the androgen-response signature → paint `Pate4` (highest Moran's I, 0.936)
→ all eight sections at once → day 10 vs day 20 on one shared scale → molecule/programme/
niche/axis (`Wnt4 → Fzd1`, basal epithelium → fibroblast).

**The timecourse scene states the confound rather than hiding it.** Across the 8 sections
the androgen programme collapses (0.32 → −0.08, Δ −0.40), luminal identity falls
(0.66 → 0.07) and the stromal score rises (0.52 → 1.12). But luminal epithelium is
**42.0% of day-10 spots and 4.7% of day-20 spots**, so the shift is largely compositional
— consistent with castration involuting the gland, and equally consistent with the day-20
sections simply being cut through less prostate. Section-level pseudobulk separates the
timepoints on 9,346 of 13,781 genes at n=4v4, which is what that confound looks like. The
console and the Inspector both say so on screen.

Autostart is gated on the abstract modal being closed, so the story never plays out behind
it. Deferred console lines carry an epoch token and drop if the viewer has already moved on.

## Multi-section grid (the **▦ Grid** button)

The portal's `sq.pl.spatial_scatter`: any number of the 8 sections × one or two colour
channels, in one grid. It carries the arguments that plot has, as live controls:

- **Sections**: chips select which sections are plotted; the grid re-lays itself out. With
  4 replicates per timepoint, the natural use is day 10 across the top, day 20 below.
- **Channel 1 / Channel 2**: any two of compartment, signature, pathway, H&E stain, or the
  active gene. Each channel gets **one colour scale across every section**, so a colour
  means the same value in all panels: this is what makes the D10→D20 androgen collapse
  legible side by side rather than per-panel-rescaled.
- **⇄ Sections first / Channels first**: `library_first`, i.e. whether a row is a channel
  (sections across) or a section (channels across).
- **⬡ Edges**: draws the 6-NN spatial graph (`connectivity_key`) beneath the spots — the
  same graph the neighborhood enrichment, centrality and Moran's I are computed on, so the
  analytics and the picture are the same object.
- **⛓ Link crop**: zoom or drag any panel and the identical `crop_coord` applies to every
  panel, squidpy's semantics exactly. **◫ Crop to A** takes the crop from lasso bucket A's
  bounding box; **⤢ Reset** clears it.
- **Size**: global spot size plus per-panel `−`/`+` (squidpy's per-library `size` list),
  **◍ H&E** background, **▬ µm** 500 µm scale bar, and **⤓** per-panel 3× PNG export.

Every µm figure is calibrated from the Visium array itself (two spots two `array_col`
apart are 100 µm centre-to-centre), **not** from `spot_diameter_fullres` — Space Ranger
reports that as the 65 µm render diameter, not the 55 µm capture spot. On these sections
the measured pixel size is ~0.3077 µm/px, which puts `spot_diameter_fullres` at 65.1 µm;
using it directly would shrink every distance by 18%. The 6-NN median edge length comes
out at 100.1 µm, i.e. the array pitch, which is the check that the calibration is right.

## Spatial statistics (the **Spatial** tab)

`pipeline/squidpy_stats.py` precomputes the rest of the squidpy toolbox per section into
`data/sq_stats.json`; the tab plots it for the section you are on:

- **Co-occurrence** (`sq.gr.co_occurrence`): p(compartment | a spot of the chosen
  compartment within r) ÷ p(compartment), as a function of radius in µm. Answers *at what
  distance* one compartment is enriched around another, which the pairwise neighborhood
  z-score cannot.
- **Ripley's L** (`sq.gr.ripley`, 100 permutations): clustered vs indistinguishable-from-
  random, with the permuted 95% envelope drawn. Visium labels sit on a fixed lattice, so
  this is clustering of the *labels*, not of physical cells.
- **Graph hubs** (`sq.gr.centrality_scores`): degree / closeness / clustering per
  compartment over the spatial graph.
- **Adjacency** (`sq.gr.interaction_matrix`): the observed fraction of graph edges between
  each pair of compartments — the untested counterpart of the ⬡ Neighbors z-score.
- **SVG: sepal vs Moran** (`sq.gr.sepal` on the hex-grid graph vs `sq.gr.spatial_autocorr`
  Moran's I with 100 permutations, over the 900 exported genes). The two rank genes
  differently on purpose: Moran rewards smooth gradients, sepal rewards sparse patchy
  structure. Click any point to colour the map by that gene.
- **H&E ↔ expression** (`sq.im.calculate_image_features`, summary + Haralick texture, plus
  skimage `rgb2hed` colour deconvolution): per-spot histology features correlated
  (Spearman) with the expression programmes at the same spots. The three stain densities
  (**hematoxylin** = nuclei, **eosin** = ECM/collagen, and hematoxylin SD = texture) are
  written back into `data/<sid>.json` and appear in **Color by → Histology**, so the
  histology itself can go on the map next to the transcriptomic programmes — useful here,
  since involution is as much a morphological change as a transcriptional one.

## Access gate

`app.html` opens behind the same **soft client-side gate** as the other portals —
password **`may-prostate`**. It is not a security control (`data/*` stays fetchable); it just
keeps the link from being casually browsable. To change it, put the SHA-256 of the new
password in `GATE_HASH` in `app.html` (and in `pipeline/patch_app.py`, round 3, so a rebuild
keeps it):

```bash
python3 -c "import hashlib;print(hashlib.sha256('NEW PASSWORD'.encode()).hexdigest())"
```

## Run locally
```bash
cd portal && python3 -m http.server 8899   # then open http://localhost:8899/app.html
```
Static — deploy the `portal/` folder to any static host as-is; `app.html` is the entry point,
and `vercel.json` rewrites `/` → `/app.html`.

**Static-host note:** Zarr v2 metadata are dotfiles (`.zarray`, `.zattrs`, `.zgroup`,
`.zmetadata`) and Vercel 404s dotfiles. The export also writes a non-dot copy of each and
`vercel.json` rewrites `…/.zarray` → `…/zarray`. `python3 -m http.server` serves the dotfiles
directly, so local dev needs no rewrite.

## Rebuild from source
```bash
cd ..                                     # may_prostate_portal/
python3 pipeline/process.py               # per-section json + expr + manifest + precomputed
python3 pipeline/tissue_export.py         # cropped H&E backgrounds
python3 pipeline/spatial_analytics.py     # nhood.json + spatial niches (writes obs.niche)
python3 pipeline/integrate.py             # Harmony atlas + sub-states + pathways + LR + Moran's I
python3 pipeline/timecourse_export.py     # D10-vs-D20 stats + section-level pseudobulk DE
python3 pipeline/h5ad_export.py           # per-section .h5ad downloads
python3 pipeline/vitessce_export.py       # AnnData-Zarr stores + Vitessce configs

# sq_stats.json + graph/<sid>.json + the HE_* obs columns (the Spatial tab and ▦ Grid edges).
# Needs squidpy >=1.6 with the image extras (scikit-image, tifffile, dask) — use the env that
# has them; ~3 min per section, and it checkpoints sq_stats.json after each one.
/home/ubuntu/analysis-env/bin/python pipeline/squidpy_stats.py    # [sid ...] to redo one section
```
`squidpy_stats.py` reads the GEO supplementary files directly from `data/gse295043/`
(`<GSM>_<sid>_tissue_hires_image.png.gz`, `_scalefactors_json.json.gz`, and the legacy
headerless `_tissue_positions_list.csv.gz`), not the processed h5ad, because the hires H&E
and the array coordinates are what the image features and the µm calibration need.

`app.html` itself is generated, not hand-edited: it is the Aguado portal shell retargeted by
`pipeline/patch_app.py`, where every edit is an exact-string replacement asserted to apply
exactly once. To rebuild it:

```bash
cp ../aguado/portal/app.html portal/app.html && python3 pipeline/patch_app.py
```

The Vitessce engine (React + Vitessce + the blosc zarr codec) is **vendored** under
`data/vitessce/vendor/` (copied from the Aguado build), so the viewer needs no third-party
CDN at runtime.

Source data: <https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE295043>
