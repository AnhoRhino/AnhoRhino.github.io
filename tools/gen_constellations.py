#!/usr/bin/env python3
"""
Generate the CONSTELLATIONS table for assets/js/constellations.js from real
star positions (RA in hours, Dec in degrees, apparent magnitude).

Raw RA/Dec cannot be plotted directly: near the pole a degree of RA is almost
no distance at all, which is why Ursa Minor and Draco come out mangled. So we
stereographically project each constellation about its own centroid, then
normalise while PRESERVING the true aspect ratio so nothing is stretched.
"""
import math, json

# name: (stars {label: (RA_hours, Dec_deg, mag)}, [ (a,b) line pairs by label ])
CAT = {
 'Ursa Major': (
   {'Dubhe':(11.062,61.751,1.79),'Merak':(11.031,56.382,2.37),'Phecda':(11.897,53.695,2.44),
    'Megrez':(12.257,57.033,3.31),'Alioth':(12.900,55.960,1.76),'Mizar':(13.399,54.925,2.23),
    'Alkaid':(13.792,49.313,1.85)},
   [('Dubhe','Merak'),('Merak','Phecda'),('Phecda','Megrez'),('Megrez','Dubhe'),
    ('Megrez','Alioth'),('Alioth','Mizar'),('Mizar','Alkaid')]),

 'Orion': (
   {'Betelgeuse':(5.919,7.407,0.50),'Bellatrix':(5.418,6.350,1.64),'Meissa':(5.585,9.934,3.39),
    'Mintaka':(5.533,-0.299,2.23),'Alnilam':(5.604,-1.202,1.69),'Alnitak':(5.679,-1.943,1.77),
    'Saiph':(5.796,-9.670,2.09),'Rigel':(5.242,-8.202,0.13)},
   [('Meissa','Betelgeuse'),('Meissa','Bellatrix'),('Betelgeuse','Alnitak'),
    ('Bellatrix','Mintaka'),('Mintaka','Alnilam'),('Alnilam','Alnitak'),
    ('Alnitak','Saiph'),('Mintaka','Rigel')]),

 'Cassiopeia': (
   {'Caph':(0.153,59.150,2.27),'Schedar':(0.675,56.537,2.23),'Gamma':(0.945,60.717,2.15),
    'Ruchbah':(1.430,60.235,2.68),'Segin':(1.906,63.670,3.35)},
   [('Caph','Schedar'),('Schedar','Gamma'),('Gamma','Ruchbah'),('Ruchbah','Segin')]),

 'Cygnus': (
   {'Deneb':(20.690,45.280,1.25),'Sadr':(20.370,40.257,2.23),'Albireo':(19.512,27.960,3.05),
    'Gienah':(20.770,33.970,2.48),'Delta':(19.749,45.131,2.87)},
   [('Deneb','Sadr'),('Sadr','Albireo'),('Sadr','Gienah'),('Sadr','Delta')]),

 'Lyra': (
   {'Vega':(18.615,38.784,0.03),'Epsilon':(18.739,39.670,4.59),'Zeta':(18.746,37.605,4.34),
    'Delta':(18.895,36.899,4.22),'Sulafat':(18.982,32.690,3.24),'Sheliak':(18.834,33.363,3.52)},
   [('Vega','Epsilon'),('Vega','Zeta'),('Zeta','Sheliak'),('Sheliak','Sulafat'),
    ('Sulafat','Delta'),('Delta','Zeta')]),

 'Scorpius': (
   {'Graffias':(16.090,-19.805,2.62),'Dschubba':(16.005,-22.622,2.29),'Pi':(15.981,-26.114,2.89),
    'Sigma':(16.353,-25.593,2.90),'Antares':(16.490,-26.432,1.06),'Tau':(16.598,-28.216,2.82),
    'Epsilon':(16.836,-34.293,2.29),'Mu':(16.865,-38.048,3.00),'Zeta':(16.911,-42.362,3.62),
    'Eta':(17.203,-43.239,3.33),'Sargas':(17.622,-42.998,1.86),'Iota':(17.793,-40.127,3.03),
    'Kappa':(17.708,-39.030,2.39),'Shaula':(17.560,-37.104,1.62),'Lesath':(17.512,-37.296,2.69)},
   [('Graffias','Dschubba'),('Dschubba','Pi'),('Pi','Sigma'),('Sigma','Antares'),
    ('Antares','Tau'),('Tau','Epsilon'),('Epsilon','Mu'),('Mu','Zeta'),('Zeta','Eta'),
    ('Eta','Sargas'),('Sargas','Iota'),('Iota','Kappa'),('Kappa','Shaula'),('Shaula','Lesath')]),

 'Draco': (
   {'Eltanin':(17.943,51.489,2.24),'Rastaban':(17.507,52.301,2.79),'Grumium':(17.892,56.873,3.75),
    'Nu':(17.542,55.173,4.88),'Delta':(19.209,67.661,3.07),'Zeta':(17.146,65.715,3.17),
    'Eta':(16.400,61.514,2.73),'Iota':(15.416,58.966,3.29),'Thuban':(14.073,64.376,3.65),
    'Kappa':(12.558,69.788,3.87)},
   [('Eltanin','Rastaban'),('Rastaban','Nu'),('Nu','Grumium'),('Grumium','Eltanin'),
    ('Grumium','Delta'),('Delta','Zeta'),('Zeta','Eta'),('Eta','Iota'),
    ('Iota','Thuban'),('Thuban','Kappa')]),

 'Perseus': (
   {'Mirfak':(3.405,49.861,1.79),'Algol':(3.136,40.956,2.12),'Gamma':(3.080,53.506,2.93),
    'Delta':(3.715,47.788,3.01),'Epsilon':(3.964,40.010,2.89),'Zeta':(3.902,31.884,2.85),
    'Rho':(3.085,38.840,3.32),'Eta':(2.845,55.895,3.76)},
   [('Eta','Gamma'),('Gamma','Mirfak'),('Mirfak','Delta'),('Delta','Epsilon'),
    ('Epsilon','Zeta'),('Mirfak','Algol'),('Algol','Rho')]),

 'Taurus': (
   {'Aldebaran':(4.599,16.509,0.87),'Elnath':(5.438,28.608,1.65),'Zeta':(5.627,21.143,3.00),
    'Gamma':(4.330,15.628,3.65),'Delta':(4.382,17.543,3.77),'Epsilon':(4.478,19.180,3.53),
    'Theta':(4.478,15.871,3.40),'Lambda':(4.011,12.490,3.47)},
   [('Elnath','Epsilon'),('Epsilon','Delta'),('Delta','Gamma'),('Gamma','Lambda'),
    ('Gamma','Theta'),('Theta','Aldebaran'),('Aldebaran','Zeta')]),

 'Gemini': (
   {'Castor':(7.577,31.888,1.58),'Pollux':(7.755,28.026,1.14),'Alhena':(6.629,16.399,1.93),
    'Delta':(7.335,21.982,3.53),'Epsilon':(6.732,25.131,3.06),'Zeta':(7.068,20.570,3.79),
    'Eta':(6.248,22.507,3.28),'Mu':(6.383,22.514,2.87),'Tau':(7.187,30.245,4.41),
    'Xi':(6.755,12.896,3.36),'Theta':(6.201,33.961,3.60),'Upsilon':(7.596,26.896,4.06),
    'Lambda':(7.302,16.540,3.58)},
   [('Theta','Castor'),('Castor','Tau'),('Tau','Epsilon'),('Epsilon','Mu'),('Mu','Eta'),
    ('Castor','Pollux'),('Pollux','Upsilon'),('Upsilon','Delta'),('Delta','Zeta'),
    ('Zeta','Alhena'),('Delta','Lambda'),('Lambda','Xi')]),

 'Ursa Minor': (
   {'Polaris':(2.530,89.264,1.98),'Yildun':(17.537,86.586,4.36),'Epsilon':(16.766,82.037,4.23),
    'Zeta':(15.734,77.794,4.29),'Eta':(16.291,75.755,4.95),'Kochab':(14.845,74.156,2.08),
    'Pherkad':(15.345,71.834,3.00)},
   [('Polaris','Yildun'),('Yildun','Epsilon'),('Epsilon','Zeta'),('Zeta','Eta'),
    ('Eta','Kochab'),('Kochab','Pherkad'),('Pherkad','Zeta')]),

 'Corona Borealis': (
   {'Theta':(15.553,31.359,4.14),'Beta':(15.463,29.106,3.68),'Alphecca':(15.578,26.715,2.22),
    'Gamma':(15.713,26.296,3.84),'Delta':(15.827,26.068,4.63),'Epsilon':(15.960,26.878,4.15),
    'Iota':(16.024,29.851,4.99)},
   [('Theta','Beta'),('Beta','Alphecca'),('Alphecca','Gamma'),('Gamma','Delta'),
    ('Delta','Epsilon'),('Epsilon','Iota')]),

 'Cepheus': (
   {'Alderamin':(21.310,62.585,2.45),'Alfirk':(21.478,70.561,3.23),'Errai':(23.656,77.632,3.21),
    'Iota':(22.828,66.200,3.52),'Zeta':(22.181,58.201,3.35)},
   [('Alderamin','Alfirk'),('Alfirk','Errai'),('Errai','Iota'),('Iota','Zeta'),('Zeta','Alderamin')]),

 'Canis Major': (
   {'Sirius':(6.752,-16.716,-1.46),'Mirzam':(6.378,-17.956,1.98),'Muliphein':(7.064,-15.633,4.11),
    'Wezen':(7.140,-26.393,1.83),'Adhara':(6.977,-28.972,1.50),'Aludra':(7.402,-29.303,2.45),
    'Furud':(6.338,-30.063,3.02)},
   [('Mirzam','Sirius'),('Sirius','Muliphein'),('Sirius','Wezen'),('Wezen','Adhara'),
    ('Adhara','Furud'),('Wezen','Aludra')]),

 'Leo': (
   {'Regulus':(10.139,11.967,1.40),'Eta':(10.122,16.763,3.52),'Algieba':(10.333,19.841,2.08),
    'Zeta':(10.278,23.417,3.44),'Mu':(9.879,26.007,3.88),'Epsilon':(9.764,23.774,2.98),
    'Delta':(11.235,20.524,2.56),'Theta':(11.237,15.430,3.33),'Denebola':(11.818,14.572,2.14)},
   [('Epsilon','Mu'),('Mu','Zeta'),('Zeta','Algieba'),('Algieba','Eta'),('Eta','Regulus'),
    ('Regulus','Theta'),('Theta','Denebola'),('Denebola','Delta'),('Delta','Algieba')]),
}


# Constellations are drawn at whatever angle the sky happens to present, which
# can make a familiar shape unrecognisable. For a few, we rotate the whole
# figure so it sits the way people picture it: the Northern Cross upright,
# Cassiopeia's W the right way up. The shape itself is untouched.
ALIGN = {
 'Cygnus':     ('Deneb', 'Albireo', 'down'),
 'Cassiopeia': ('Caph', 'Segin', 'right'),
 'Ursa Major': ('Dubhe', 'Alkaid', 'right'),
 'Leo':        ('Regulus', 'Denebola', 'right'),
}


def project(stars, align=None, labels=None):
    """Stereographic projection about the centroid, then normalise keeping aspect."""
    pts = [(ra * 15.0, dec) for (ra, dec, _m) in stars]
    # centroid on the unit sphere, so it works across the 0h wrap and at the pole
    vx = vy = vz = 0.0
    for a, d in pts:
        ar, dr = math.radians(a), math.radians(d)
        vx += math.cos(dr) * math.cos(ar); vy += math.cos(dr) * math.sin(ar); vz += math.sin(dr)
    a0 = math.atan2(vy, vx)
    d0 = math.atan2(vz, math.hypot(vx, vy))

    out = []
    for a, d in pts:
        ar, dr = math.radians(a), math.radians(d)
        da = ar - a0
        k = 2.0 / (1.0 + math.sin(d0) * math.sin(dr) + math.cos(d0) * math.cos(dr) * math.cos(da))
        x = k * math.cos(dr) * math.sin(da)
        y = k * (math.cos(d0) * math.sin(dr) - math.sin(d0) * math.cos(dr) * math.cos(da))
        # east is to the LEFT when you look at the sky, and screen y grows downward
        out.append((-x, -y))

    if align and labels:
        a, b, want = align
        ia, ib = labels.index(a), labels.index(b)
        ang = math.atan2(out[ib][1] - out[ia][1], out[ib][0] - out[ia][0])
        target = math.pi / 2 if want == 'down' else 0.0   # screen y grows downward
        th = target - ang
        c_, s_ = math.cos(th), math.sin(th)
        out = [(x * c_ - y * s_, x * s_ + y * c_) for x, y in out]

    xs = [p[0] for p in out]; ys = [p[1] for p in out]
    w = max(xs) - min(xs); h = max(ys) - min(ys)
    span = max(w, h) or 1.0
    # centre the smaller axis inside the unit box -> no stretching
    ox = (1.0 - w / span) / 2.0
    oy = (1.0 - h / span) / 2.0
    return [(round(ox + (x - min(xs)) / span, 3), round(oy + (y - min(ys)) / span, 3)) for x, y in out]


def emit():
    blocks = []
    checkdata = []
    for name, (stars, lines) in CAT.items():
        labels = list(stars.keys())
        idx = {l: i for i, l in enumerate(labels)}
        xy = project([stars[l] for l in labels], ALIGN.get(name), labels)
        starlits = [f'[{x},{y},{stars[l][2]}]' for l, (x, y) in zip(labels, xy)]
        linelits = [f'[{idx[a]},{idx[b]}]' for a, b in lines]
        # wrap at ~86 cols
        def wrap(items, indent):
            out, cur = [], ''
            for it in items:
                if cur and len(cur) + len(it) + 1 > 74:
                    out.append(cur + ',')      # keep the separator at the break
                    cur = ''
                cur += (',' if cur else '') + it
            if cur: out.append(cur)
            return ('\n' + ' ' * indent).join(out)
        blocks.append(
            "  {\n"
            f"    name: '{name}',\n"
            f"    stars: [{wrap(starlits, 12)}],\n"
            f"    lines: [{wrap(linelits, 12)}],\n"
            "  },")
        checkdata.append({'name': name,
                          'stars': [[x, y, stars[l][2]] for l, (x, y) in zip(labels, xy)],
                          'lines': [[idx[a], idx[b]] for a, b in lines]})
    return '\n'.join(blocks), checkdata


if __name__ == '__main__':
    js, chk = emit()
    print(js)
    print(f'\n// {len(chk)} constellations, {sum(len(c["stars"]) for c in chk)} stars',
          file=__import__('sys').stderr)
    print('// Paste the block above over the CONSTELLATIONS array in '
          'assets/js/constellations.js', file=__import__('sys').stderr)
