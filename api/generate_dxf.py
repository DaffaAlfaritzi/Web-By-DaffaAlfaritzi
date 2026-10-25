from http.server import BaseHTTPRequestHandler
import json
import tempfile
import os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from shapely.geometry import Polygon, LineString
import ezdxf

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))

            # Cari path angelllll.dxf di server Vercel
            current_dir = os.path.dirname(__file__)
            template_path = os.path.join(current_dir, '..', 'angelllll.dxf')
            if not os.path.exists(template_path):
                template_path = 'angelllll.dxf'

            dxf_bytes = auto_fit_data_to_template(template_path, payload)

            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/dxf')
            self.send_header('Content-Disposition', 'attachment; filename="Hasil_Layout_Bersih.dxf"')
            self.end_headers()
            self.wfile.write(dxf_bytes)
        except Exception as e:
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(f"Error: {str(e)}".encode('utf-8'))


def auto_fit_data_to_template(template_path, payload):
    points = payload.get('points', [])
    shapes = payload.get('shapes', [])
    interval_minor = float(payload.get('contour_minor', 0.5))
    interval_major = float(payload.get('contour_major', 2.5))

    if os.path.exists(template_path):
        doc = ezdxf.readfile(template_path)
    else:
        doc = ezdxf.new('R2018')

    msp = doc.modelspace()

    box_min_x = 2415.8836
    box_max_x = 2517.7836
    box_min_y = 7406.4278
    box_max_y = 7488.5278

    target_cx = (box_min_x + box_max_x) / 2.0
    target_cy = (box_min_y + box_max_y) / 2.0

    avail_w = (box_max_x - box_min_x) * 0.86
    avail_h = (box_max_y - box_min_y) * 0.86

    raw_E = [float(p['E']) for p in points]
    raw_N = [float(p['N']) for p in points]
    raw_Z = [float(p['Z']) for p in points]

    survey_cx = (min(raw_E) + max(raw_E)) / 2.0
    survey_cy = (min(raw_N) + max(raw_N)) / 2.0
    span_E = (max(raw_E) - min(raw_E)) or 1.0
    span_N = (max(raw_N) - min(raw_N)) or 1.0

    scale_factor = min(avail_w / span_E, avail_h / span_N)

    def transform_pt(e, n, z):
        tx = target_cx + (e - survey_cx) * scale_factor
        ty = target_cy + (n - survey_cy) * scale_factor
        return (tx, ty, z)

    layers_cfg = {
        'TITIK_UKUR': 4,
        'DIGITASI_BATAS': 3,
        'DIGITASI_BANGUNAN': 1,
        'DIGITASI_PARKIRAN': 6,
        'DIGITASI_JALAN_PARIT': 2,
        'KONTUR_MINOR': 8,
        'KONTUR_MAYOR': 30,
        'LABEL_KONTUR': 2
    }
    for lname, col in layers_cfg.items():
        if lname not in doc.layers:
            doc.layers.add(name=lname, color=col)

    pts_dict = {}
    fit_E, fit_N, fit_Z = [], [], []

    for pt in points:
        pid = str(pt['P'])
        e, n, z = float(pt['E']), float(pt['N']), float(pt['Z'])

        fx, fy, fz = transform_pt(e, n, z)
        pts_dict[pid] = (fx, fy, fz)
        fit_E.append(fx)
        fit_N.append(fy)
        fit_Z.append(z)

        msp.add_point((fx, fy, fz), dxfattribs={'layer': 'TITIK_UKUR'})

    boundary_polys, building_polys = [], []
    layer_by_type = {
        'boundary': 'DIGITASI_BATAS',
        'building': 'DIGITASI_BANGUNAN',
        'parking': 'DIGITASI_PARKIRAN',
        'polyline': 'DIGITASI_JALAN_PARIT'
    }

    for shape in shapes:
        stype = shape.get('type', 'polyline')
        pids = [str(p) for p in shape.get('points', [])]
        coords_3d = [pts_dict[p] for p in pids if p in pts_dict]
        coords_2d = [(c[0], c[1]) for c in coords_3d]

        if len(coords_3d) < 2:
            continue

        layer_name = layer_by_type.get(stype, 'DIGITASI_JALAN_PARIT')
        is_closed = stype in ['boundary', 'building', 'parking']
        msp.add_polyline3d(coords_3d, close=is_closed, dxfattribs={'layer': layer_name})

        if stype == 'boundary' and len(coords_2d) >= 3:
            poly = Polygon(coords_2d).buffer(0)
            if not poly.is_empty:
                boundary_polys.append(poly)
        elif stype == 'building' and len(coords_2d) >= 3:
            poly = Polygon(coords_2d).buffer(0)
            if not poly.is_empty:
                building_polys.append(poly)

    if len(fit_E) >= 3:
        E_arr, N_arr, Z_arr = np.array(fit_E), np.array(fit_N), np.array(fit_Z)
        clip_mask = None
        if len(boundary_polys) > 0:
            clip_mask = boundary_polys[0]
            for bp in boundary_polys[1:]:
                clip_mask = clip_mask.union(bp)
            for bldg in building_polys:
                clip_mask = clip_mask.difference(bldg)

        z_min = np.floor(Z_arr.min() / interval_minor) * interval_minor
        z_max = np.ceil(Z_arr.max() / interval_minor) * interval_minor
        levels = np.arange(z_min, z_max + interval_minor, interval_minor)

        fig, ax = plt.subplots()
        cs = ax.tricontour(E_arr, N_arr, Z_arr, levels=levels)
        plt.close(fig)

        for idx, elev in enumerate(cs.levels):
            rem = abs(elev % interval_major)
            is_major = np.isclose(rem, 0, atol=1e-3) or np.isclose(rem, interval_major, atol=1e-3)
            layer_name = 'KONTUR_MAYOR' if is_major else 'KONTUR_MINOR'

            for seg in cs.allsegs[idx]:
                if len(seg) < 2:
                    continue
                line_geom = LineString(seg)
                if clip_mask is not None and not clip_mask.is_empty:
                    line_geom = line_geom.intersection(clip_mask)

                geoms = [line_geom] if line_geom.geom_type == 'LineString' else getattr(line_geom, 'geoms', [])
                for g in geoms:
                    if g.geom_type == 'LineString' and len(g.coords) >= 2:
                        pts_3d = [(x, y, float(elev)) for x, y in g.coords]
                        msp.add_polyline3d(pts_3d, dxfattribs={'layer': layer_name})

                        if is_major and g.length > 10.0:
                            mid_pt = g.interpolate(0.5, normalized=True)
                            msp.add_text(
                                f"{elev:.1f}",
                                dxfattribs={'layer': 'LABEL_KONTUR', 'height': 0.55}
                            ).set_placement((mid_pt.x, mid_pt.y, float(elev)))

    with tempfile.NamedTemporaryFile(delete=False, suffix='.dxf') as tmp:
        tmp_path = tmp.name
    doc.saveas(tmp_path)
    with open(tmp_path, 'rb') as f:
        dxf_bytes = f.read()
    os.remove(tmp_path)
    return dxf_bytes
