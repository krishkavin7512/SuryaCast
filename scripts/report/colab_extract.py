"""Turns the printed outputs of the executed Colab notebook into colab.json for the report.

    python scripts/report/colab_extract.py <executed.ipynb | outputs.txt> <colab.json> --url <share link>

Input is either an executed .ipynb file or a plain-text dump of the notebook's printed
output (copied from the Colab page). Every number in the report's Colab tables comes
from here, so the report always agrees with the notebook run.
"""
import argparse
import json
import re
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("source")
ap.add_argument("out")
ap.add_argument("--url", required=True)
ap.add_argument("--runtime", default="")
a = ap.parse_args()

raw = Path(a.source).read_text(encoding="utf-8")
if a.source.endswith(".ipynb"):
    nb = json.loads(raw)
    chunks = []
    for c in nb["cells"]:
        for o in c.get("outputs", []):
            if o["output_type"] == "stream":
                chunks.append("".join(o["text"]))
            elif o["output_type"] in ("execute_result", "display_data") and "text/plain" in o["data"]:
                chunks.append("".join(o["data"]["text/plain"]))
    text = "\n".join(chunks)
else:
    text = raw

m = re.search(r"SUMMARY_JSON\s*(\[.*?\])\s*(?:\n|$)", text, re.S)
rows = json.loads(m.group(1))
nets = [(int(n), int(e), float(v)) for n, e, v in re.findall(r"network (\d): best epoch\s+(\d+), validation RMSE\(Kt\) = ([\d.]+)", text)]
ci = {k: [float(x), float(y)] for k, x, y in re.findall(r"(SuryaCast neural network \(this notebook\)|Hargreaves-Samani \(FAO-56\))\s+R.\s*95% CI:\s*([\d.]+)\s*-\s*([\d.]+)", text)}
out = {
    "url": a.url,
    "rows": rows,
    "networks": [{"id": n, "bestEpoch": e, "valRmse": v} for n, e, v in nets],
    "trainSeconds": int(re.search(r"trained 5 networks in (\d+) s", text).group(1)),
    "gradientError": float(re.search(r"max gradient error:\s*([\d.eE+-]+)", text).group(1)),
    "raCheck": float(re.search(r"Ra check:\s*([\d.]+)", text).group(1)),
    "bootstrapCI": {"nn": ci["SuryaCast neural network (this notebook)"], "hargreaves": ci["Hargreaves-Samani (FAO-56)"]},
    "runtime": a.runtime,
}
assert len(rows) == 8 and len(nets) == 5, (len(rows), len(nets))
Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", a.out, "| networks", len(nets), "| train", out["trainSeconds"], "s | grad err", out["gradientError"])
