const fs = require("fs");
const xml2js = require("xml2js");
const parser = new xml2js.Parser();
const Level = require("node-elma").Level;
const turf = require("@turf/turf");

const dist = (x1, y1, x2, y2) => {
  const a = x1 - x2;
  const b = y1 - y2;
  return Math.sqrt(a * a + b * b);
};

const lvlToLev = (inFile, outFile) => {
  fs.readFile(`${inFile}`, function(err, data) {
    parser.parseString(data, function(err, result) {
      const polygons = result.level.block
        .filter(
          b =>
            (!b.position[0].$.islayer ||
              b.position[0].$.layerid === undefined) &&
            b.position[0].$.dynamic === undefined &&
            !b.position[0].$.background
        )
        .map(b => {
          if (!b.vertex) return [];
          const p = b.vertex
            .map(v => [
              Number(v.$.x) + Number(b.position[0].$.x),
              Number(v.$.y) + Number(b.position[0].$.y)
            ])
            .filter((v, i, arr) => {
              const pre = i === 0 ? arr[arr.length - 1] : arr[i - 1];
              const d = dist(v[0], v[1], pre[0], pre[1]);
              return d > 0;
            });

          p.push(p[0]);
          return p;
        })
        .filter(p => {
          return p.length > 3;
        })
        .map(p => {
          return turf.polygon([p]);
        });

      const union = turf.union(...polygons);
      const limits = result.level.limits[0].$;

      const frame = [
        [Number(limits.left), Number(limits.top)],
        [Number(limits.right), Number(limits.top)],
        [Number(limits.right), Number(limits.bottom)],
        [Number(limits.left), Number(limits.bottom)],
        [Number(limits.left), Number(limits.top)]
      ];

      const diff = turf.difference(turf.polygon([frame]), union);

      const data =
        diff.geometry.type === "Polygon"
          ? diff.geometry.coordinates
          : diff.geometry.coordinates.reduce((acc, val) => acc.concat(val), []);

      const lev = new Level();

      lev.polygons = data.map(p => {
        return {
          grass: false,
          vertices: p
            .filter((v, i, arr) => {
              const pre = i === 0 ? arr[arr.length - 1] : arr[i - 1];
              const d = dist(v[0], v[1], pre[0], pre[1]);
              return d > 0.05;
            })
            .map(v => {
              return {
                x: v[0],
                y: v[1] * -1
              };
            })
        };
      });

      const start = result.level.entity.find(e => e.$.typeid === "PlayerStart")
        .position[0].$;
      const end = result.level.entity.find(e => e.$.typeid === "EndOfLevel")
        .position[0].$;

      const apples = result.level.entity.filter(
        e => e.$.typeid === "Strawberry"
      );
      const killers = result.level.entity.filter(e => e.$.typeid === "Wrecker");

      lev.objects = [
        {
          type: "start",
          x: Number(start.x) - 0.4,
          y: (Number(start.y) + 0.4) * -1
        },
        {
          type: "exit",
          x: Number(end.x),
          y: (Number(end.y) + 0.4) * -1
        },
        ...apples.map(s => {
          return {
            type: "apple",
            x: Number(s.position[0].$.x),
            y: (Number(s.position[0].$.y) + 0.4) * -1,
            gravity: "normal"
          };
        }),
        ...killers.map(s => {
          return {
            type: "killer",
            x: Number(s.position[0].$.x),
            y: (Number(s.position[0].$.y) + 0.4) * -1
          };
        })
      ];

      lev.save(outFile);
    });
  });
};

module.exports = lvlToLev;
