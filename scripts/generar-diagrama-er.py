"""Genera docs/diagrama-er.svg (diagrama entidad-relación de NexoRural).

Uso (desde la carpeta del proyecto):  python scripts/generar-diagrama-er.py .
"""
import os, sys
from xml.sax.saxutils import escape as esc

os.chdir(sys.argv[1])

W, H = 1440, 900
ROW, HEAD = 24, 44
F = "font-family=\"'Plus Jakarta Sans', 'Segoe UI', sans-serif\""
M = "font-family=\"'Roboto Mono', Consolas, monospace\""

# (nombre_columna, tipo, clave)  clave: PK, FK, UQ, '' ; '?' al final del tipo = admite NULL
tablas = {
    'usuarios': dict(x=40, y=70, w=330, cols=[
        ('id', 'INT', 'PK'), ('nombre', 'VARCHAR(80)', ''), ('usuario', 'VARCHAR(40)', 'UQ'),
        ('clave_hash', 'VARCHAR(255)', ''), ('rol', "ENUM", ''), ('activo', 'TINYINT(1)', ''),
        ('intentos_fallidos', 'TINYINT', ''), ('bloqueado_hasta', 'DATETIME?', ''),
        ('ultimo_ingreso', 'DATETIME?', ''), ('creado_en', 'DATETIME', '')]),
    'cargas': dict(x=555, y=70, w=330, cols=[
        ('id', 'INT', 'PK'), ('usuario_id', 'INT', 'FK'), ('camion_id', 'INT?', 'FK'),
        ('patente', 'VARCHAR(10)?', ''), ('capacidad_maxima_kg', 'DECIMAL(9,2)', ''),
        ('estado', 'ENUM', ''), ('iniciada_en', 'DATETIME', ''), ('cerrada_en', 'DATETIME?', ''),
        ('observaciones', 'VARCHAR(255)?', '')]),
    'camiones': dict(x=1070, y=70, w=330, cols=[
        ('id', 'INT', 'PK'), ('patente', 'VARCHAR(10)', 'UQ'), ('descripcion', 'VARCHAR(100)?', ''),
        ('capacidad_maxima_kg', 'DECIMAL(9,2)', ''), ('activo', 'TINYINT(1)', ''), ('creado_en', 'DATETIME', '')]),
    'animales_carga': dict(x=200, y=480, w=330, cols=[
        ('id', 'INT', 'PK'), ('carga_id', 'INT', 'FK'), ('tipo_animal_id', 'SMALLINT', 'FK'),
        ('caravana', 'VARCHAR(20)?', ''), ('peso_kg', 'DECIMAL(7,2)', ''), ('fuera_de_rango', 'TINYINT(1)', ''),
        ('registrado_en', 'DATETIME', ''), ('eliminado', 'TINYINT(1)', ''), ('eliminado_en', 'DATETIME?', '')]),
    'tipos_animal': dict(x=580, y=560, w=290, cols=[
        ('id', 'SMALLINT', 'PK'), ('codigo', 'VARCHAR(20)', 'UQ'), ('nombre', 'VARCHAR(40)', ''),
        ('peso_min_ref_kg', 'DECIMAL(7,2)', ''), ('peso_max_ref_kg', 'DECIMAL(7,2)', ''), ('activo', 'TINYINT(1)', '')]),
    'intentos_rechazados': dict(x=920, y=480, w=330, cols=[
        ('id', 'INT', 'PK'), ('carga_id', 'INT', 'FK'), ('tipo_animal_id', 'SMALLINT?', 'FK'),
        ('peso_ingresado', 'VARCHAR(30)?', ''), ('motivo', 'ENUM', ''), ('peso_acumulado_kg', 'DECIMAL(9,2)', ''),
        ('registrado_en', 'DATETIME', '')]),
}


def fila_y(t, col):
    T = tablas[t]
    i = [c[0] for c in T['cols']].index(col)
    return T['y'] + HEAD + i * ROW + ROW / 2


def alto(t):
    return HEAD + len(tablas[t]['cols']) * ROW + 8


out = []
a = out.append
a(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">')
a('''<defs>
  <marker id="muchos" viewBox="0 0 20 20" refX="18" refY="10" markerWidth="16" markerHeight="16" orient="auto-start-reverse">
    <path d="M18 2 L4 10 L18 18 M4 2 V18" fill="none" stroke="#0F172A" stroke-width="1.8"/></marker>
  <marker id="uno" viewBox="0 0 20 20" refX="18" refY="10" markerWidth="16" markerHeight="16" orient="auto-start-reverse">
    <path d="M10 2 V18 M15 2 V18" fill="none" stroke="#0F172A" stroke-width="1.8"/></marker>
  <marker id="cero-uno" viewBox="0 0 24 20" refX="22" refY="10" markerWidth="18" markerHeight="16" orient="auto-start-reverse">
    <circle cx="7" cy="10" r="4.5" fill="#fff" stroke="#0F172A" stroke-width="1.8"/><path d="M17 2 V18" stroke="#0F172A" stroke-width="1.8"/></marker>
</defs>''')
a(f'<rect width="{W}" height="{H}" fill="#F8FAFC"/>')
a(f'<text x="40" y="40" {F} font-size="24" font-weight="800" fill="#0F172A">NexoRural · Diagrama entidad-relación</text>')
a(f'<text x="{W-40}" y="40" {F} font-size="14" fill="#64748B" text-anchor="end">Base nexorural · MySQL / MariaDB · AGO Soluciones</text>')

# Relaciones (se dibujan antes de las tablas). (camino, marcador_inicio, marcador_fin, etiqueta, posición etiqueta)
rel = []
# usuarios 1 ── N cargas
y1, y2 = fila_y('usuarios', 'id'), fila_y('cargas', 'usuario_id')
rel.append((f'M370 {y1} H462 V{y2} H555', 'uno', 'muchos', 'realiza', (508, y2 - 8)))
# camiones 0..1 ── N cargas
y1, y2 = fila_y('camiones', 'id'), fila_y('cargas', 'camion_id')
rel.append((f'M1070 {y1} H978 V{y2} H885', 'cero-uno', 'muchos', 'transporta', (932, y2 - 8)))
# cargas 1 ── N animales_carga
yb = tablas['cargas']['y'] + alto('cargas')
rel.append((f'M650 {yb} V420 H365 V480', 'uno', 'muchos', 'contiene', (505, 412)))
# cargas 1 ── N intentos_rechazados
rel.append((f'M790 {yb} V440 H1085 V480', 'uno', 'muchos', 'registra', (940, 432)))
# tipos_animal 1 ── N animales_carga
y1, y2 = fila_y('tipos_animal', 'id'), fila_y('animales_carga', 'tipo_animal_id')
rel.append((f'M580 {y1} H555 V{y2} H530', 'uno', 'muchos', '', None))
# tipos_animal 0..1 ── N intentos_rechazados
y1, y2 = fila_y('tipos_animal', 'id'), fila_y('intentos_rechazados', 'tipo_animal_id')
rel.append((f'M870 {y1} H895 V{y2} H920', 'cero-uno', 'muchos', '', None))

for d, ini, fin, txt, pos in rel:
    a(f'<path d="{d}" fill="none" stroke="#0F172A" stroke-width="1.6" marker-start="url(#{ini})" marker-end="url(#{fin})"/>')
    if txt:
        a(f'<text x="{pos[0]}" y="{pos[1]}" {F} font-size="12" font-style="italic" fill="#475569" text-anchor="middle">{txt}</text>')

COLOR_CLAVE = {'PK': ('#0F172A', '#fff'), 'FK': ('#059669', '#fff'), 'UQ': ('#E2E8F0', '#334155')}
for nombre, T in tablas.items():
    x, y, w = T['x'], T['y'], T['w']
    h = alto(nombre)
    a(f'<g><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="#fff" stroke="#CBD5E1" stroke-width="1.5"/>')
    a(f'<path d="M{x} {y+12} a12 12 0 0 1 12 -12 h{w-24} a12 12 0 0 1 12 12 v{HEAD-12} h-{w} z" fill="#0F172A"/>')
    a(f'<text x="{x+16}" y="{y+28}" {M} font-size="15" font-weight="600" fill="#fff">{nombre}</text>')
    for i, (col, tipo, clave) in enumerate(T['cols']):
        cy = y + HEAD + i * ROW
        if i % 2:
            a(f'<rect x="{x+1}" y="{cy}" width="{w-2}" height="{ROW}" fill="#F8FAFC"/>')
        tx = x + 14
        if clave:
            bg, fg = COLOR_CLAVE[clave]
            a(f'<rect x="{tx}" y="{cy+5}" width="26" height="14" rx="4" fill="{bg}"/>')
            a(f'<text x="{tx+13}" y="{cy+15.5}" {F} font-size="9.5" font-weight="700" fill="{fg}" text-anchor="middle">{clave}</text>')
        nulo = tipo.endswith('?')
        tipo = tipo.rstrip('?')
        peso = '700' if clave == 'PK' else '500'
        a(f'<text x="{tx+34}" y="{cy+16.5}" {M} font-size="12.5" font-weight="{peso}" fill="#0F172A">{esc(col)}</text>')
        a(f'<text x="{x+w-14}" y="{cy+16.5}" {M} font-size="11.5" fill="#64748B" text-anchor="end">{esc(tipo)}{" · NULL" if nulo else ""}</text>')
    a('</g>')

# Vista y triggers
vx, vy = 1070, 290
a(f'<rect x="{vx}" y="{vy}" width="330" height="140" rx="12" fill="#ECFDF5" stroke="#059669" stroke-width="1.5" stroke-dasharray="6 5"/>')
a(f'<text x="{vx+16}" y="{vy+26}" {M} font-size="14" font-weight="600" fill="#047857">VISTA v_resumen_cargas</text>')
for i, t in enumerate(['peso_cargado_kg = SUM(peso_kg)', 'disponible_kg = capacidad − cargado',
                       'porcentaje_uso · cantidad_animales', '(solo animales no eliminados)']):
    a(f'<text x="{vx+16}" y="{vy+52+i*20}" {M} font-size="11.5" fill="#065F46">{t}</text>')

lx, ly = 40, 790
a(f'<rect x="{lx}" y="{ly}" width="{W-80}" height="86" rx="12" fill="#fff" stroke="#CBD5E1"/>')
a(f'<text x="{lx+16}" y="{ly+26}" {F} font-size="13" font-weight="700" fill="#0F172A">Reglas en la base (triggers y CHECK)</text>')
reglas = ['trg_animales_antes_insertar: si cargado + nuevo > capacidad → "Capacidad máxima superada"; solo en cargas abiertas.',
          'trg_animales_antes_actualizar: revalida la capacidad al corregir o restaurar · trg_cargas_antes_actualizar: capacidad ≥ cargado.',
          'CHECK: 0 < peso_kg ≤ 2.000 · 0 < capacidad ≤ 60.000 · peso_min_ref < peso_max_ref.']
for i, t in enumerate(reglas):
    a(f'<text x="{lx+16}" y="{ly+46+i*17}" {F} font-size="12" fill="#334155">{esc(t)}</text>')

# Leyenda de notación (dentro del recuadro de reglas, a la derecha)
nx = 900
a(f'<text x="{nx}" y="{ly+26}" {F} font-size="13" font-weight="700" fill="#0F172A">Notación</text>')
items = [('uno', 'uno (obligatorio)'), ('cero-uno', 'cero o uno (opcional)'), ('muchos', 'muchos')]
for i, (m, t) in enumerate(items):
    xx = nx + i * 170
    a(f'<path d="M{xx+40} {ly+56} H{xx}" stroke="#0F172A" stroke-width="1.6" marker-end="url(#{m})"/>')
    a(f'<text x="{xx+48}" y="{ly+60}" {F} font-size="11.5" fill="#475569">{t}</text>')

a('</svg>')
open('docs/diagrama-er.svg', 'w', encoding='utf8').write('\n'.join(out))
print('svg ok')
