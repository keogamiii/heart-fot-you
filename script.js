/* ============================================================
   Сцена:
   1) на входе — только надпись I love you
   2) по тапу из неё вылетают «i love you»
   3) плотно заполняют всё сердце, форма обрезается клипом
   ============================================================ */

(function () {
    "use strict";

    var stage = document.getElementById("stage");
    var heart = document.getElementById("heart");
    var nameEl = document.getElementById("name");

    var SAMPLES = 240; // плотность полигона контура
    var started = false;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    // ?motion=1 — показать полную анимацию даже при reduce-motion
    if (/[?&]motion=1/.test(window.location.search)) {
        document.documentElement.classList.add("force-motion");
    }

    // классическое уравнение сердца: x = 16 sin^3 t, y = ...
    function heartAt(t) {
        var x = 16 * Math.pow(Math.sin(t), 3);
        var y = 13 * Math.cos(t)
            - 5 * Math.cos(2 * t)
            - 2 * Math.cos(3 * t)
            - Math.cos(4 * t);

        // минус — потому что на экране ось Y вниз
        return { x: x, y: -y };
    }

    // замкнутый полигон сердца, центрированный по вертикали
    function shapePolygon(n) {
        var poly = [];

        for (var i = 0; i < n; i++) {
            var t = (i / n) * Math.PI * 2;
            var p = heartAt(t);
            poly.push({ x: p.x, y: p.y - 2.5 });
        }

        return poly;
    }

    // точка внутри полигона — ray casting
    function insidePolygon(x, y, poly) {
        var inside = false;

        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            var xi = poly[i].x, yi = poly[i].y;
            var xj = poly[j].x, yj = poly[j].y;

            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
        }

        return inside;
    }

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }

        return arr;
    }

    // плотное заполнение: сетка по всему сердцу + джиттер и случайный угол.
    // чем меньше множители, тем гуще сетка и больше фраз
    function fillPoints(poly, scaleX, scaleY, opts) {
        var points = [];
        var stepX = opts.phraseWidth * 0.55;
        var stepY = opts.phraseHeight * 1.0;
        var row = 0;

        for (var y = -14.5 * scaleY; y <= 14.5 * scaleY; y += stepY) {
            var shift = (row % 2) * stepX * 0.5;
            row++;

            for (var x = -16 * scaleX + shift; x <= 16 * scaleX; x += stepX) {
                var px = x + (Math.random() - 0.5) * stepX * 0.7;
                var py = y + (Math.random() - 0.5) * stepY * 0.7;

                // центр должен быть внутри сердца, край ровняет clip-path
                if (!insidePolygon(px / scaleX, py / scaleY, poly)) continue;

                // под самой надписью фраз не ставим — только за ней.
                // зона ровно по слову плюс полфразы запаса со всех сторон
                if (opts.hole) {
                    var hole = opts.hole;

                    if (Math.abs(px - hole.x) < hole.halfW && Math.abs(py - hole.y) < hole.halfH) {
                        continue;
                    }
                }

                var angle = (Math.random() * 2 - 1) * 24;

                points.push({ px: px, py: py, angle: angle });
            }
        }

        return points;
    }

    // реальный размер фразы при текущем кегле — им меряем «дыру» под надписью,
    // чтобы зона была ровно по делу, а не на глаз
    function measurePhrase(fontSize) {
        var probe = document.createElement("span");

        probe.className = "phrase";
        probe.textContent = "i love you";
        probe.style.fontSize = fontSize + "px";
        probe.style.animation = "none";
        probe.style.visibility = "hidden";
        probe.style.left = "0";
        probe.style.top = "0";

        heart.appendChild(probe);

        var size = { w: probe.offsetWidth, h: probe.offsetHeight };

        probe.remove();

        return size;
    }

    function build() {
        var w = stage.clientWidth;
        var h = stage.clientHeight;

        if (!w || !h) return;

        var fontSize = Math.max(9, Math.min(13, Math.round(w * 0.026)));
        var phraseWidth = fontSize * 5.6;
        var phraseHeight = fontSize * 1.4;

        // запас на половину фразы: под поворотом она занимает больше места
        var pad = phraseWidth * 0.6;

        // сердце: полуширина 16, полувысота 14.5.
        // по горизонтали чуть растягиваем, по вертикали чуть прижимаем
        var stretchX = 1.12;
        var stretchY = 0.94;

        var scale = Math.min(
            (w / 2 - pad) / (16 * stretchX),
            (h / 2 - pad) / (14.5 * stretchY)
        );

        if (!isFinite(scale) || scale <= 0) return;

        var scaleX = scale * stretchX;
        var scaleY = scale * stretchY;

        var poly = shapePolygon(SAMPLES);

        // клип в форме сердца: фразы заполняют всё, а край обрезается ровно
        var path = "";

        for (var i = 0; i < poly.length; i++) {
            var cx = w / 2 + poly[i].x * scaleX;
            var cy = h / 2 + poly[i].y * scaleY;
            path += (i ? " L " : "M") + cx.toFixed(1) + " " + cy.toFixed(1);
        }

        heart.style.clipPath = 'path("' + path + ' Z")';

        // стартовая точка и зона надписи
        var nameRect = nameEl.getBoundingClientRect();
        var namePadBottom = parseFloat(getComputedStyle(nameEl).paddingBottom) || 0;

        // высота именно текста: нижний паддинг добавлен под хвост «у»
        var nameH = nameRect.height - namePadBottom;

        // точка старта — внутри надписи, из неё и разлетаются фразы
        var startX = (nameRect.left + nameRect.width / 2) - w / 2;
        var startY = (nameRect.top + nameH / 2) - h / 2;
        var spreadX = nameRect.width * 0.38;
        var spreadY = nameH * 0.45;

        // дыра под надписью: слово + габарит повёрнутой фразы,
        // чтобы ни одна не залезла под буквы даже боком
        var phraseBox = measurePhrase(fontSize);
        var rotMax = 24 * Math.PI / 180;
        var padX = (phraseBox.w * Math.cos(rotMax) + phraseBox.h * Math.sin(rotMax)) / 2;
        var padY = (phraseBox.h * Math.cos(rotMax) + phraseBox.w * Math.sin(rotMax)) / 2;

        // запас сознательно маленький: слово чуть перекрывать фразами можно,
        // зато вокруг него нет пустой банки
        var hole = {
            x: startX,
            y: startY,
            halfW: nameRect.width / 2 + padX * 0.42,
            halfH: nameH / 2 + padY * 0.42
        };

        var inner = fillPoints(poly, scaleX, scaleY, {
            phraseWidth: phraseWidth,
            phraseHeight: phraseHeight,
            hole: hole
        }).map(function (p) {
            return { x: p.px, y: p.py, angle: p.angle };
        });

        shuffle(inner);

        heart.innerHTML = "";

        // показываем процесс: каждая следующая вылетает с интервалом
        var step = Math.max(0.0045, Math.min(0.045, 1.4 / inner.length));

        for (var n = 0; n < inner.length; n++) {
            var p = inner[n];
            var el = document.createElement("span");

            el.className = "phrase";
            el.textContent = "i love you";
            el.style.fontSize = fontSize + "px";
            el.style.setProperty(
                "--sx",
                (startX + (Math.random() * 2 - 1) * spreadX).toFixed(1) + "px"
            );
            el.style.setProperty(
                "--sy",
                (startY + (Math.random() * 2 - 1) * spreadY).toFixed(1) + "px"
            );
            el.style.setProperty("--tx", p.x.toFixed(1) + "px");
            el.style.setProperty("--ty", p.y.toFixed(1) + "px");
            el.style.setProperty("--rot", p.angle.toFixed(1) + "deg");
            el.style.setProperty("--delay", (0.45 + n * step).toFixed(2) + "s");
            el.style.setProperty("--op", (0.24 + Math.random() * 0.3).toFixed(2));

            heart.appendChild(el);
        }

        // пульс включаем после того, как последняя фраза долетела
        var flightMs = (0.45 + Math.max(0, inner.length - 1) * step + 1.35) * 1000;

        startBeat(flightMs);
    }

    function start() {
        started = true;
        build();
    }

    var beatTimer = null;

    // текущая фаза пульсации фона в миллисекундах — чтобы сердце билось с ним в такт
    function bgPhase() {
        var anims = document.getAnimations ? document.getAnimations() : [];

        for (var i = 0; i < anims.length; i++) {
            if (anims[i].animationName === "bg-pulse" && typeof anims[i].currentTime === "number") {
                return ((anims[i].currentTime % 3600) + 3600) % 3600;
            }
        }

        return null;
    }

    // пульс стартует ровно в момент сборки, а не раньше.
    // фокус: ставим анимацию на паузу с нужной фазой (отрицательный delay),
    // а когда фразы долетели — просто снимаем паузу. Так сердце
    // не шевелится, пока идёт вылет, и сразу попадает в ритм фона
    function startBeat(baseMs) {
        window.clearTimeout(beatTimer);

        heart.style.animation = "none";
        void heart.offsetWidth;

        var phase = bgPhase();
        var startedAt = performance.now();

        heart.style.animation = "beat 3.6s ease-in-out infinite";

        if (phase === null) {
            // не смогли узнать фазу фона — просто ждём сборки
            heart.style.animationDelay = (baseMs / 1000).toFixed(3) + "s";
            heart.style.animationPlayState = "running";
            return;
        }

        var startPhase = (phase + baseMs) % 3600;

        heart.style.animationDelay = (-startPhase / 1000).toFixed(3) + "s";
        heart.style.animationPlayState = "paused";

        beatTimer = window.setTimeout(function () {
            heart.style.animationPlayState = "running";

            // таймер под нагрузкой опаздывает — догоняем фазу по часам,
            // чтобы сердце не отставало от слова и фона
            var late = performance.now() - startedAt - baseMs;

            if (late > 10) {
                var anims = document.getAnimations ? document.getAnimations() : [];

                for (var i = 0; i < anims.length; i++) {
                    if (anims[i].animationName === "beat") {
                        anims[i].currentTime = startPhase + late;
                        break;
                    }
                }
            }
        }, baseMs);
    }

    // тап по экрану — запуск и повтор
    var busy = false;

    stage.addEventListener("pointerdown", function () {
        if (busy) return;
        busy = true;

        start();

        window.setTimeout(function () {
            busy = false;
        }, 250);
    });

    // поворот телефона / ресайз
    var resizeTimer = null;

    window.addEventListener("resize", function () {
        if (!started) return;

        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(build, 220);
    });
})();
