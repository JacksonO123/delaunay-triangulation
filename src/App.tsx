import { onMount, createSignal } from 'solid-js';
import './app.scss';
import {
  Circle,
  Color,
  SceneCollection,
  Simulation,
  Vector,
  randInt,
  Line,
  Polygon,
  clamp,
  transitionValues,
  frameLoop,
  distance,
  degToRad
} from 'simulationjs';
import triangulate from 'delaunay-triangulate';

const App = () => {
  const [expanded, setExpanded] = createSignal(false);

  onMount(() => {
    const canvas = new Simulation('canvas');
    canvas.fitElement();

    const triangles = new SceneCollection('triangles');
    canvas.add(triangles);

    const lines = new SceneCollection('test');
    canvas.add(lines);

    const outerBuffer = 120;
    // const outerBuffer = 0;

    const maxEffectDist = 225 * canvas.ratio;
    const rotationSpeed = 4;

    class Node extends Circle {
      direction: number; // 0 - 360
      speed = 0.045 * canvas.ratio;
      constructor(
        pos: Vector,
        radius: number,
        color?: Color,
        startAngle?: number,
        endAngle?: number,
        thickness?: number,
        rotation?: number,
        fill?: boolean,
        counterClockwise?: boolean
      ) {
        super(pos, radius, color, startAngle, endAngle, thickness, rotation, fill, counterClockwise);
        this.direction = randInt(360);
      }
      translate(mousePos: Vector | null, dt: number) {
        if (mousePos !== null) {
          const dist = distance(this.pos, mousePos);
          if (dist < maxEffectDist) {
            const ratio = (maxEffectDist - dist) / maxEffectDist;
            const amount = rotationSpeed * ratio;
            const vec = new Vector(1, 0).rotate(this.direction - 90);
            const dot = clamp(vec.dot(mousePos.clone().sub(this.pos)), -1, 1);
            this.direction += amount * dot;
          }
        }

        const xAmount = Math.cos(degToRad(this.direction)) * this.speed * dt;
        const yAmount = Math.sin(degToRad(this.direction)) * this.speed * dt;
        this.pos.x += xAmount;
        this.pos.y += yAmount;

        if (this.pos.x < -outerBuffer) {
          this.pos.x = canvas.width * canvas.ratio + outerBuffer;
        } else if (this.pos.x > canvas.width * canvas.ratio + outerBuffer) {
          this.pos.x = -outerBuffer;
        }

        if (this.pos.y < -outerBuffer) {
          this.pos.y = canvas.height * canvas.ratio + outerBuffer;
        } else if (this.pos.y > canvas.height * canvas.ratio + outerBuffer) {
          this.pos.y = -outerBuffer;
        }
      }
    }

    const drawLines = false;
    // const drawLines = true;

    const numCircles = 200;
    const points = generatePoints(numCircles);
    const dots = generateCircles(points);

    const colorCombos = [
      [new Color(158, 219, 230), new Color(14, 123, 143)],
      [new Color(255, 255, 255), new Color(14, 123, 143)],
      [new Color(255, 255, 255), new Color(0, 0, 0)],
      [new Color(238, 164, 127), new Color(0, 83, 156)],
      [new Color(137, 172, 227), new Color(234, 115, 141)],
      [new Color(251, 248, 190), new Color(35, 79, 112)],
      [new Color(173, 216, 230), new Color(0, 0, 139)],
      [new Color(232, 201, 63), new Color(0, 0, 0)],
      [new Color(255, 255, 255), new Color(10, 87, 17)]
    ];

    let currentColorCombo = 0;
    let fromColor = colorCombos[currentColorCombo][0].clone();
    let toColor = colorCombos[currentColorCombo][1].clone();

    let transitioning = false;
    let nextMove: number | null = null;
    window.addEventListener('keydown', (e) => {
      const num = +e.key;
      if (!isNaN(num) && num !== 0 && num - 1 < colorCombos.length) {
        if (transitioning) {
          nextMove = num - 1;
        } else {
          currentColorCombo = num - 1;
          transitionColors();
        }
      }
    });

    function easeOutQuart(x: number): number {
      return 1 - Math.pow(1 - x, 4);
    }

    function transitionColors() {
      transitioning = true;
      const fromColorDiff = new Color(
        colorCombos[currentColorCombo][0].r - fromColor.r,
        colorCombos[currentColorCombo][0].g - fromColor.g,
        colorCombos[currentColorCombo][0].b - fromColor.b
      );
      const toColorDiff = new Color(
        colorCombos[currentColorCombo][1].r - toColor.r,
        colorCombos[currentColorCombo][1].g - toColor.g,
        colorCombos[currentColorCombo][1].b - toColor.b
      );
      transitionValues(
        () => {},
        (p) => {
          fromColor.r += fromColorDiff.r * p;
          toColor.r += toColorDiff.r * p;

          fromColor.g += fromColorDiff.g * p;
          toColor.g += toColorDiff.g * p;

          fromColor.b += fromColorDiff.b * p;
          toColor.b += toColorDiff.b * p;
          return true;
        },
        () => {
          fromColor = colorCombos[currentColorCombo][0].clone();
          toColor = colorCombos[currentColorCombo][1].clone();
          transitioning = false;
          if (nextMove) {
            currentColorCombo = nextMove;
            nextMove = null;
            transitionColors();
          }
        },
        1,
        easeOutQuart
      );
    }

    let pos: Vector | null = null;
    window.addEventListener('mousedown', (e) => {
      pos = new Vector(e.offsetX, e.offsetY).multiply(canvas.ratio);
    });
    window.addEventListener('mouseup', () => {
      pos = null;
    });
    window.addEventListener('mousemove', (e) => {
      if (pos) {
        pos = new Vector(e.offsetX, e.offsetY).multiply(canvas.ratio);
      }
    });

    frameLoop((p: number) => {
      movePoints(dots, pos, Math.max(0.01, p));
      drawTriangles(dots);
      drawPoints(dots);
    })();

    function drawTriangles(circles: Node[]) {
      lines.empty();
      triangles.empty();

      const corners = [
        new Vector(-outerBuffer, -outerBuffer),
        new Vector(-outerBuffer, canvas.height * canvas.ratio + outerBuffer),
        new Vector(canvas.width * canvas.ratio + outerBuffer, -outerBuffer),
        new Vector(canvas.width * canvas.ratio + outerBuffer, canvas.height * canvas.ratio + outerBuffer)
      ];
      const dots = [...generateCircles(corners), ...circles];
      const posArr = getPosArr(dots);
      const triangulated: [number, number, number][] = triangulate(posArr);
      triangulated.forEach((triangle) => {
        if (drawLines) {
          const line1 = new Line(dots[triangle[0]].pos, dots[triangle[1]].pos, new Color(0, 0, 0));
          const line2 = new Line(dots[triangle[1]].pos, dots[triangle[2]].pos, new Color(0, 0, 0));
          const line3 = new Line(dots[triangle[2]].pos, dots[triangle[0]].pos, new Color(0, 0, 0));
          lines.add(line1);
          lines.add(line2);
          lines.add(line3);
        }

        const change = new Color(toColor.r - fromColor.r, toColor.g - fromColor.g, toColor.b - fromColor.b);

        // const avgY = clamp(
        //   Math.max(dots[triangle[0]].pos.y, dots[triangle[1]].pos.y, dots[triangle[2]].pos.y),
        //   0,
        //   canvas.height * canvas.ratio
        // );
        const avgY = Math.min(
          canvas.height * canvas.ratio,
          Math.max(0, (dots[triangle[0]].pos.y + dots[triangle[1]].pos.y + dots[triangle[2]].pos.y) / 3)
        );
        const ratio = avgY / (canvas.height * canvas.ratio);
        const poly = new Polygon(
          new Vector(0, 0),
          [dots[triangle[0]].pos, dots[triangle[1]].pos, dots[triangle[2]].pos],
          new Color(
            fromColor.r + change.r * ratio,
            fromColor.g + change.g * ratio,
            fromColor.b + change.b * ratio
          )
        );
        triangles.add(poly);
      });
    }

    function getPosArr(points: Node[]) {
      return points.map((p) => [p.pos.x, p.pos.y]);
    }

    function movePoints(points: Node[], mousePos: Vector | null, dt: number) {
      points.forEach((p) => p.translate(mousePos, dt));
    }

    function generatePoints(num: number) {
      const res: Vector[] = [];
      for (let i = 0; i < num; i++) {
        res.push(
          new Vector(
            randInt(canvas.width + 2 * outerBuffer, -outerBuffer) * canvas.ratio,
            randInt(canvas.height + 2 * outerBuffer, -outerBuffer) * canvas.ratio
          )
        );
        // res.push(new Vector(canvas.width, canvas.height));
      }
      return res;
    }

    function generateCircles(points: Vector[]) {
      return points.map(
        (p) =>
          new Node(
            p,
            randInt(3.25, 1.75) * canvas.ratio,
            drawLines ? new Color(0, 0, 0) : new Color(255, 255, 255, 0.4)
          )
      );
    }

    function drawPoints(points: Node[]) {
      points.forEach((p) => {
        if (!canvas.ctx) return;
        p.draw(canvas.ctx);
      });
    }
  });

  const toggleExpanded = () => {
    setExpanded(!expanded());
  };

  const closeExpanded = () => {
    setExpanded(false);
  };

  return (
    <div class="app">
      <canvas id="canvas"></canvas>
      <div
        id="author"
        class={expanded() ? 'expanded' : ''}
        onClick={closeExpanded}
      >
        Made by
        <br />
        Jackson Otto
      </div>
      <div class="bubble-wrapper">
        <span
          class={`bubble ${expanded() ? 'expanded' : ''}`}
          onClick={toggleExpanded}
        >
          <span class="content-wrapper">
            <u>Directions</u>
            <br />
            <span>Press the number keys to switch color schemes</span>
          </span>
        </span>
      </div>
    </div>
  );
};

export default App;
