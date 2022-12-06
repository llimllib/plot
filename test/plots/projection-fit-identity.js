import * as Plot from "@observablehq/plot";

// The "identity" projection (aka null projection) does not get fit
export default async function () {
  return Plot.plot({
    width: 640,
    height: 400,
    style: "overflow: visible;",
    projection: {
      type: "identity",
      domain: {
        type: "MultiPoint",
        coordinates: [
          [-32, -20],
          [32, 20]
        ]
      }
    },
    marks: [
      Plot.geo({
        type: "LineString",
        coordinates: Array.from({length: 400}, (_, i) => [Math.cos(i / 10) * (i / 20), Math.sin(i / 10) * (i / 20)])
      }),
      Plot.frame()
    ]
  });
}
