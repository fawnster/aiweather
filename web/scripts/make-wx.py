#!/usr/bin/env python3
"""Draws aiweather's weather icons (public/wx/*.svg) as line icons in the logo's own language: the logo's cloud
(three circles on a flat base, round strokes, the same stroke-to-size ratio) with the bottom closed and no dot, an
outlined sun, a crescent moon, rain strokes, a bolt and a question mark. Flat colours, no gradients or glows.
Run:  python3 -I web/scripts/make-wx.py   (writes into web/public/wx)"""
import math, os

OUT = os.environ.get('WX_OUT') or os.path.join(os.path.dirname(__file__), '..', 'public', 'wx')
INK, SUN, RAIN = '#F1EEE6', '#F6A83A', '#4A9DFF'   # the logo's ink, warm orange, rain blue

# --- the logo's cloud (web/src/mark.js): circles L, M, R on a base at y=71; its stroke is 6.2 on a 70-wide cloud
L, M, R, BASE = (31, 56, 15), (52, 43, 22), (72, 57, 14), 71
BOX = (L[0] - L[2], M[1] - M[2], R[0] + R[2], BASE)          # 16, 21, 86, 71
STROKE_RATIO = 6.2 / (BOX[2] - BOX[0])

def upper_hit(a, b):
    (x0, y0, r0), (x1, y1, r1) = a, b
    d = math.hypot(x1 - x0, y1 - y0)
    l = (r0 * r0 - r1 * r1 + d * d) / (2 * d)
    h = math.sqrt(max(r0 * r0 - l * l, 0))
    mx, my = x0 + l * (x1 - x0) / d, y0 + l * (y1 - y0) / d
    p1 = (mx + h * (y1 - y0) / d, my - h * (x1 - x0) / d)
    p2 = (mx - h * (y1 - y0) / d, my + h * (x1 - x0) / d)
    return p1 if p1[1] < p2[1] else p2

def cw(c, p, q):
    a1, a2 = math.atan2(p[1] - c[1], p[0] - c[0]), math.atan2(q[1] - c[1], q[0] - c[0])
    s = (a2 - a1) % (2 * math.pi)
    return f'{1 if s > math.pi else 0} 1'

def arc_pts(c, p, q, n=160):
    """Points along the clockwise arc of circle c from p to q (the same arc the path draws)."""
    a1, a2 = math.atan2(p[1] - c[1], p[0] - c[0]), math.atan2(q[1] - c[1], q[0] - c[0])
    s = (a2 - a1) % (2 * math.pi)
    return [(c[0] + c[2] * math.cos(a1 + s * t / n), c[1] + c[2] * math.sin(a1 + s * t / n)) for t in range(n + 1)]

def cloud(x, y, w):
    """The logo cloud, closed, with its top-left at (x, y) and width w.
    Returns (path d, stroke width, box, dist) where dist(px, py) is how far a point is from the filled cloud."""
    s = w / (BOX[2] - BOX[0])
    P = lambda px, py: (x + (px - BOX[0]) * s, y + (py - BOX[1]) * s)
    lm, mr = upper_hit(L, M), upper_hit(M, R)
    lb, rb = (L[0], BASE), (R[0], BASE)
    f = lambda p: f'{P(*p)[0]:.2f} {P(*p)[1]:.2f}'
    d = (f'M{f(lb)}A{L[2] * s:.2f} {L[2] * s:.2f} 0 {cw(L, lb, lm)} {f(lm)}'
         f'A{M[2] * s:.2f} {M[2] * s:.2f} 0 {cw(M, lm, mr)} {f(mr)}'
         f'A{R[2] * s:.2f} {R[2] * s:.2f} 0 {cw(R, mr, rb)} {f(rb)}Z')
    # the same outline as points, for clearance tests
    outline = [P(*p) for p in arc_pts(L, lb, lm) + arc_pts(M, lm, mr) + arc_pts(R, mr, rb)]
    (x0, yb), (x1, _) = P(*lb), P(*rb)
    outline += [(x1 + (x0 - x1) * t / 80, yb) for t in range(81)]
    discs = [(*P(c[0], c[1]), c[2] * s) for c in (L, M, R)]
    def inside(px, py):
        if py > yb: return False
        if any(math.hypot(px - cx, py - cy) <= r for cx, cy, r in discs): return True
        tops = [cy - math.sqrt(r * r - (px - cx) ** 2) for cx, cy, r in discs if abs(px - cx) <= r]
        return x0 <= px <= x1 and bool(tops) and py >= min(tops)
    def dist(px, py):
        return 0.0 if inside(px, py) else min(math.hypot(px - qx, py - qy) for qx, qy in outline)
    return d, w * STROKE_RATIO, (x, y, x + w, y + (BOX[3] - BOX[1]) * s), dist

def clear_of(dist, cloud_sw, gap, sw):
    """A test for sun rays behind a cloud: only rays that clear the cloud (and its gap) completely are drawn, so
    no ray ends in a sliver or a stub where the cloud cuts it."""
    room = cloud_sw / 2 + gap + sw / 2 + .3
    return lambda x0, y0, x1, y1: all(dist(x0 + (x1 - x0) * t / 16, y0 + (y1 - y0) * t / 16) >= room for t in range(17))

def stroke(d, color=INK, sw=4.0, extra=''):
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw:.2f}" stroke-linecap="round" stroke-linejoin="round"{extra}/>'

def line(x0, y0, x1, y1, color, sw):
    return f'<line x1="{x0:.2f}" y1="{y0:.2f}" x2="{x1:.2f}" y2="{y1:.2f}" stroke="{color}" stroke-width="{sw:.2f}" stroke-linecap="round"/>'

def sun(cx, cy, r, sw, ray=2.95, keep=lambda *seg: True):
    segs = [(cx + (r + sw * 1.45) * math.cos(t), cy + (r + sw * 1.45) * math.sin(t),
             cx + (r + sw * ray) * math.cos(t), cy + (r + sw * ray) * math.sin(t)) for t in (k * math.pi / 4 for k in range(8))]
    rays = ''.join(line(*seg, SUN, sw) for seg in segs if keep(*seg))
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{SUN}" stroke-width="{sw:.2f}"/>' + rays

def moon(cx, cy, r, sw):
    """A crescent outline: the disc minus a second disc offset to the upper right."""
    O, I = (cx, cy, r), (cx + r * .55, cy - r * .45, r * .82)
    (x0, y0, r0), (x1, y1, r1) = O, I
    d = math.hypot(x1 - x0, y1 - y0)
    l = (r0 * r0 - r1 * r1 + d * d) / (2 * d)
    h = math.sqrt(max(r0 * r0 - l * l, 0))
    mx, my = x0 + l * (x1 - x0) / d, y0 + l * (y1 - y0) / d
    p1 = (mx + h * (y1 - y0) / d, my - h * (x1 - x0) / d)
    p2 = (mx - h * (y1 - y0) / d, my + h * (x1 - x0) / d)
    # outer edge the long way round (away from I), inner edge back along I
    return stroke(f'M{p1[0]:.2f} {p1[1]:.2f}A{r0:.2f} {r0:.2f} 0 1 0 {p2[0]:.2f} {p2[1]:.2f}'
                  f'A{r1:.2f} {r1:.2f} 0 0 1 {p1[0]:.2f} {p1[1]:.2f}Z', SUN, sw)

def behind(d, sw, gap, content, uid):
    """`content` with the cloud (plus a small gap round its outline) cut out, so the cloud sits in front."""
    return (f'<mask id="m{uid}"><rect x="-8" y="-8" width="80" height="80" fill="#fff"/>'
            f'<path d="{d}" fill="#000" stroke="#000" stroke-width="{sw + 2 * gap:.2f}" stroke-linejoin="round"/></mask>'
            f'<g mask="url(#m{uid})">{content}</g>')

def svg(body, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{title}">{body}</svg>\n'

def write(name, body, title):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f'{name}.svg'), 'w') as fh: fh.write(svg(body, title))

SW = 4.0  # the strokes of suns, rain and bolts match the cloud's

# clear
write('clear-day', sun(32, 32, 10.5, SW), 'Clear')
write('clear-night', moon(32.4, 32.1, 15, SW), 'Clear night')

# a cloud in front with the sun or moon behind it, top right (overcast) or a big sun with a small cloud (partly cloudy)
cd, cs, _, cdist = cloud(7, 25, 46)
write('overcast-day', behind(cd, cs, 2.6, sun(44, 21.5, 6, 3.4, 2.5, clear_of(cdist, cs, 2.6, 3.4)), 'o') + stroke(cd, INK, cs), 'Overcast')
# a moon has no rays to balance the cloud, so the night pictures sit up and to the right of the day ones (centred)
nd, ns, _, _ = cloud(9, 22.6, 46)
write('overcast-night', behind(nd, ns, 2.6, moon(47, 17.6, 8.5, 3.4), 'o') + stroke(nd, INK, ns), 'Overcast night')
sd, ss, _, sdist = cloud(5, 34, 34)
write('partly-cloudy-day', behind(sd, ss, 2.4, sun(36, 26, 9, SW, keep=clear_of(sdist, ss, 2.4, SW)), 'p') + stroke(sd, INK, ss), 'Partly cloudy')
pd, ps, _, _ = cloud(9.7, 30.9, 34)
write('partly-cloudy-night', behind(pd, ps, 2.4, moon(41.7, 21.9, 12.5, SW), 'p') + stroke(pd, INK, ps), 'Partly cloudy night')

# fog: three soft waves
def wave(y, x0=11, x1=53, amp=2.6):
    seg = (x1 - x0) / 4
    d = f'M{x0} {y}'
    for k in range(4):
        xa = x0 + seg * k
        d += f'C{xa + seg * .35:.2f} {y - amp if k % 2 == 0 else y + amp:.2f} {xa + seg * .65:.2f} {y - amp if k % 2 == 0 else y + amp:.2f} {xa + seg:.2f} {y}'
    return stroke(d, INK, SW)
fog = wave(22) + wave(32) + wave(42)
write('fog-day', fog, 'Fog')
write('fog-night', fog, 'Fog night')

# rain: the cloud with three slanted strokes under it
rd, rs, rb, _ = cloud(9, 7, 46)
streaks = ''.join(line(x + 4.2, rb[3] + 6, x, rb[3] + 17, RAIN, SW) for x in (22, 31, 40))
write('rain', stroke(rd, INK, rs) + streaks, 'Rain')

# storm: the cloud, a bolt, and a short streak either side
td, ts, tb, _ = cloud(9, 5, 46)   # a little higher than the rain cloud, so the bolt has room
bolt = stroke(f'M35.5 {tb[3] + 4}L28.8 {tb[3] + 12.5}L35.8 {tb[3] + 12.5}L29.2 {tb[3] + 21}', SUN, SW)
side = line(20.5, tb[3] + 6, 17.5, tb[3] + 13, RAIN, SW) + line(46.5, tb[3] + 6, 43.5, tb[3] + 13, RAIN, SW)
write('thunderstorms-rain', stroke(td, INK, ts) + bolt + side, 'Storm')

# unknown: the cloud with a question mark
ud, us, ub, _ = cloud(9, 15, 46)
qx, qy = 32, ub[1] + (ub[3] - ub[1]) * .5
q = stroke(f'M{qx - 4.3:.2f} {qy - 4.6:.2f}A4.6 4.6 0 1 1 {qx + 1.6:.2f} {qy + .2:.2f}C{qx + .3:.2f} {qy + .9:.2f} {qx:.2f} {qy + 1.8:.2f} {qx:.2f} {qy + 3.3:.2f}', INK, 3.4)
q += f'<circle cx="{qx}" cy="{qy + 8.2:.2f}" r="2" fill="{INK}"/>'
write('not-available', stroke(ud, INK, us) + q, 'Unknown')
print('wrote', len([f for f in os.listdir(OUT) if f.endswith('.svg')]), 'icons to', os.path.abspath(OUT))
