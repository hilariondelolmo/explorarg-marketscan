#!/usr/bin/env python3
"""Genera src/content/propuesta-s80926pl.html desde los docx de HDO.

- Propuesta (control de cambios): texto final = orig + ins; los del se
  descartan. Las inserciones salen como <ins> (rojo subrayado vía CSS).
- Numeración automática de Word resuelta desde numbering.xml (incisos a., b., ...).
- Informe (rev3 con Evidencia fáctica, 17/08): intro (Objeto y método / Marco
  normativo / Cuadro) + popups "Normas violadas", "Justificación" y "Los
  hechos hablan" por artículo + Cierre.
- Informe AMPLIADO_DATOS: aporta las tablas de evidencia por artículo y las
  secciones Método de prueba / Síntesis ejecutiva / Conclusión fáctica /
  Anexo I, que se fusionan dentro de los popups existentes (decisión HDO
  2026-08-17). Sus gráficos matplotlib se descartan: los reemplazan
  componentes recharts montados sobre los placeholders .pl-chart.
"""
import re, sys, zipfile, html
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
CARPETA = ('/Users/hilariondelolmo/Desktop/01. Notas, articulos/Ley Ejecutivo/'
           'Finales/Propuestas Secretaria de Energia/Ultima Version/')
DOCX_PROP = CARPETA + '2026.08.11 Propuesta ley S80926PL SE_260729 cc HDO.docx'
DOCX_INF = CARPETA + '2026_08_17_Informe_fundamentos_S80926PL_Evidencia_factica_rev3.docx'
DOCX_AMPL = CARPETA + ('Informe_fundamentos_modificaciones_S80926PL_'
                       '11-08-2026_AMPLIADO_DATOS.docx')
SALIDA = '/Users/hilariondelolmo/Explora_projects/Explorarg_Marketscan/src/content/propuesta-s80926pl.html'

ARTS_INFORME = [3, 5, 6, 10, 12, 13, 14, 15, 16, 17, 19, 20, 26, 28, 33, 36, 38, 39, 40, 41, 42]

# Correcciones de texto dictadas por HDO sobre el docx (se aplican a todo
# lo extraído). 2026-08-17: la transferencia por diferencial de retenciones
# actualizada en el Word de Respaldo en datos (acumulado a 2025).
CORRECCIONES = {
    'USD 1.979 millones': 'USD 2.040 millones',
    # 2026-08-18: déficit acumulado conciliado con el pipeline (corte.json a
    # 2026-06); el rev3 traía 2.825.578 (aparece en Cierre y arts. 15 y 28)
    '2.825.578': '2.581.105',
}

# Overrides dictados por HDO: pisan el texto del informe docx en el popup
# indicado. Clave: (artículo, tipo) con tipo 'normas' | 'just' | 'hechos'.
# Art. 3 hechos: el rev3 nombra a Explora S.A. y su planta; HDO pidió
# (2026-08-17) no decir nada de Explora en el art. 3 — redacción neutra
# equivalente, PENDIENTE DE APROBACIÓN de HDO.
OVERRIDES = {
    (3, 'hechos'): (
        '<p>El atributo que el texto base omitía no es una promesa tecnológica: '
        'existe, se produce en el país y se certifica. La Argentina ya cuenta '
        'con producción de biodiesel de segunda generación a partir de residuos '
        'con certificación emitida bajo el esquema ISCC, verificable en el '
        'registro público de certificados vigentes de ese organismo. Las '
        'reducciones de emisiones certificadas conforme la metodología de la '
        'Renewable Energy Directive difieren de manera sustancial según la '
        'materia prima: 60% para aceite de soja con uso en transporte (62% si '
        'el uso es en la Argentina), 81% a partir de oleína y 84% a partir de '
        'residuos del procesamiento de aceites y grasas.</p>'
        '<p>Bajo el régimen vigente todos esos litros reciben idéntico '
        'tratamiento económico y regulatorio: las inversiones realizadas para '
        'mejorar el desempeño ambiental del producto -instalaciones de '
        'aprovechamiento de residuos operativas desde 2019- no obtuvieron '
        'reconocimiento alguno. Un proyecto que declara la transición hacia '
        'energías más limpias y vuelve a omitir toda pauta para valorar '
        'reducciones certificadas no corrige esa situación: la consolida con '
        'conocimiento del resultado.</p>'
    ),
    # Art. 12 hechos: cifras conciliadas con el pipeline del sitio (corte.json
    # a 2026-06) por orden de HDO 2026-08-18 — el rev3 traía otro universo
    # (déficit 2.825.578 t, eficacias 91,7/88,5/58,6, peor mes dic. 2023).
    # El docx se alineará en una rev posterior al cierre de esta revisión.
    (12, 'hechos'): (
        '<p>La facultad abierta de reducir el corte y la ausencia de '
        'consecuencias por su incumplimiento no son riesgos a prevenir: son '
        'el mecanismo documentado con el que se vació el mandato durante '
        'dieciséis años. Desde marzo de 2010 el déficit acumulado de mezcla '
        'asciende a 2.581.105 toneladas de biodiesel no incorporado, y el '
        'corte obligatorio se cumplió en solo 3 de los 16 años completos de '
        'la serie. El corte real promedio de 2023 fue de 4,6% frente al 7,5% '
        'obligatorio, con un piso histórico de 0,0% en noviembre de 2020, '
        'cuando la obligación vigente era del 10%.</p>'
        '<div class="pl-chart" data-chart="corte-serie"></div>'
        '<p>El grado de cumplimiento es función de cada gestión, no de una '
        'imposibilidad física: 92,3% y 93,7% de eficacia en los períodos '
        '2010-2015 y 2015-2019, 65,2% en 2019-2023 -la gestión a la que '
        'corresponde casi la mitad del déficit acumulado: 1.243.459 '
        'toneladas- y 82,2% desde diciembre de 2023. En junio de 2026 el '
        'corte real alcanzó 7,6%, por encima del obligatorio: cuando la '
        'autoridad administra el mandato, el mandato se cumple.</p>'
        '<div class="pl-chart" data-chart="eficacia-gestiones"></div>'
        '<p>El incumplimiento tuvo beneficiarios identificables y '
        'cuantificados: las mezcladoras acumularon USD 1.059 millones por '
        'sustituir el biodiesel no incorporado con gasoil fósil -en parte '
        'importado- y USD 407 millones adicionales por la reducción del '
        'corte que la Ley 27.640 consolidó al bajar el mandato del 10% al '
        '5%: USD 1.466 millones en total. Cada tonelada del déficit implicó '
        'reemplazar un producto nacional renovable por combustible fósil, en '
        'una porción relevante importado, con el efecto inverso al declarado '
        'sobre emisiones y balanza comercial. Un texto que reproduce la '
        'facultad discrecional sin piso, causal definida ni plazo no regula '
        'ese comportamiento: lo habilita nuevamente con el resultado a la '
        'vista.</p>'
    ),
}

# Cifras destacadas y esquemas del popup "Respaldo en datos" (formato
# aprobado por HDO 2026-08-17; los valores salen del propio texto del
# informe rev3 - si el docx cambia, revisarlos). Van antes del texto.
def _kpi(valor, label, tono=None):
    # tono: 'neg' pinta el valor de rojo (déficits / incumplimientos);
    # 'compacto' achica la tipografía (valores largos que partirían en dos
    # líneas). Se pueden combinar: 'neg compacto'.
    clase = 'pl-kpi' + ''.join(' pl-kpi-' + t for t in (tono or '').split())
    return ('<div class="' + clase + '"><span class="pl-kpi-valor">' + valor +
            '</span><span class="pl-kpi-label">' + label + '</span></div>')

def _paso(titulo, detalle):
    return ('<div class="pl-flujo-paso"><strong>' + titulo + '</strong>'
            '<span>' + detalle + '</span></div>')

FLECHA = '<span class="pl-flujo-flecha" aria-hidden="true">→</span>'

def _kpis(*pares):
    return '<div class="pl-kpis">' + ''.join(_kpi(*p) for p in pares) + '</div>'

def _flujo(*pasos):
    return ('<div class="pl-flujo">'
            + FLECHA.join(_paso(t, d) for t, d in pasos) + '</div>')

HECHOS_DESTACADOS = {
    3: _kpis(
        ('84%', 'de reducción certificada de emisiones con residuos'),
        ('81%', 'a partir de oleína'),
        ('60-62%', 'a partir de aceite de soja'),
        ('Ninguno', 'reconocimiento a esa diferencia bajo el régimen vigente', 'neg'),
    ),
    5: _kpis(
        ('2.040 M usd', 'transferidos a las integradas por el diferencial de retenciones', 'neg compacto'),
        ('3,4 veces', 'la inversión total repagada por ese diferencial'),
        ('&gt;120%', 'derechos compensatorios y antidumping aplicados por EE.UU.', 'neg'),
        ('6,3 a 1', 'escala de la integrada promedio frente a la no integrada'),
    ) + _flujo(
        ('Retenciones asimétricas', 'aceite 27-32% vs biodiesel 0-5%'),
        ('Sanciones de EE.UU. y la UE', 'por la ventaja artificial: cierre de mercados'),
        ('Acceso externo solo integrado', 'cupo UE de 1.200.000 t reservado a las firmantes'),
    ),
    6: _kpis(
        ('4', 'no integradas registradas al iniciarse la obligación de mezcla (2010)'),
        ('50.000 t', 'tope por empresa, eludido mediante fragmentación societaria'),
        ('348.000 t', 'acumuladas por un grupo con siete plantas "independientes"', 'neg'),
    ),
    10: _kpis(
        ('3 años, 3 meses y 27 días', 'demoró la primera metodología de precios ordenada por la Ley 27.640', 'neg compacto'),
        ('10', 'secretarios de Energía desde 2010: la rotación del área', 'neg'),
    ),
    12: _kpis(
        ('2,6 Mt', 'déficit de mezcla acumulado 2010-2026: 2.581.105 toneladas', 'neg'),
        ('3 de 16', 'años con el corte cumplido desde 2010', 'neg'),
        ('0,0%', 'corte real en el peor mes (nov. 2020, con 10% obligatorio)', 'neg'),
        ('65,2%', 'eficacia en la peor gestión (2019-2023)', 'neg'),
        ('1.466 M usd', 'ganancia de las mezcladoras por incumplir', 'compacto'),
    ) + _flujo(
        ('Biodiesel no incorporado', '2.581.105 t desde 2010'),
        ('Sustituido por gasoil fósil', 'en parte importado'),
        ('Ganancia de las mezcladoras', '1.059 M usd + 407 M usd por reducción del corte'),
    ),
    13: _kpis(
        ('10% → 5%', 'la reducción del mandato de biodiesel que la Ley 27.640 consolidó', 'neg'),
        ('6% + 6%', 'mínimos de caña y maíz que la facultad abierta contradecía'),
    ),
    14: _kpis(
        ('98%', 'de la demanda concentrada en cuatro compañías', 'neg'),
        ('≈60%', 'de las compras reunidas en un solo comprador', 'neg'),
        ('&gt;90%', 'del metanol provisto por ese mismo actor', 'neg'),
    ),
    15: _kpis(
        ('2.581.105 t', 'de déficit reconstruido por los privados, no publicado por el Estado', 'neg compacto'),
        ('53 M usd', 'de quebranto documentado mediante intimaciones', 'neg'),
        ('0', 'indicadores de cumplimiento publicados por el Estado', 'neg'),
    ),
    16: _kpis(
        ('5% → 7%', 'el corte elevado por la Res. 554/2010 a favor de las integradas'),
        ('98%', 'de las compras concentradas en cuatro compañías', 'neg'),
    ),
    17: _kpis(
        ('0,80 usd/l', 'cuesta el rubro metanol e insumos en la Argentina', 'neg'),
        ('0,10 usd/l', 'el mismo rubro en EE.UU. y Brasil'),
        ('&gt;90%', 'del metanol proviene de un único proveedor', 'neg'),
        ('10', 'resoluciones de precio dictadas fuera de la metodología legal', 'neg'),
    ),
    19: _kpis(
        ('84%', 'reducción certificada del biodiesel de residuos, auditada anualmente'),
        ('Menor y sin verificar', 'la reducción que acredita el coprocesado', 'neg compacto'),
        ('Solo refinadores', 'disponen de infraestructura para coprocesar', 'compacto'),
    ),
    20: _kpis(
        ('&gt;75%', 'del costo del biodiesel es el aceite, comprado a competidores directos', 'neg'),
        ('&gt;90%', 'del metanol proviene de un único proveedor', 'neg'),
        ('3,4 veces', 'la inversión repagada por ventaja regulatoria'),
        ('6,3 a 1', 'relación de escala entre integrada y no integrada promedio'),
    ),
    26: _kpis(
        ('1.059 M usd', 'ganó la sustitución del biodiesel con gasoil fósil importado', 'neg compacto'),
        ('1,10-1,15 usd/l', 'costo del biodiesel argentino a fines de 2024, equivalente a EE.UU. y Brasil', 'compacto'),
    ),
    28: _kpis(
        ('2.581.105 t', 'de déficit de mezcla sin sanción conocida', 'neg compacto'),
        ('10', 'determinaciones de precio fuera de la ley sin consecuencia', 'neg'),
        ('16 meses', 'de fórmula incumplida, documentados por los propios administrados', 'neg'),
    ),
    33: _kpis(
        ('0', 'sanciones aplicadas pese al déficit, el no retiro y el apartamiento de la fórmula', 'neg'),
        ('Sin tipo expreso', 'las conductas más lesivas del sistema', 'neg compacto'),
    ),
    36: _kpis(
        ('Ninguna', 'medición exigía el texto base a la porción exenta', 'neg'),
        ('100%', 'del biodiesel se mide, factura y certifica operación por operación'),
    ),
    38: _kpis(
        ('50.000 t', 'plantas replicadas para eludir el tope de capacidad'),
        ('2', 'espacios de indeterminación documentados que la modificación cierra', 'neg'),
    ),
    39: _kpis(
        ('3 de 5', 'umbrales de prórroga se verificarían hoy'),
        ('≈60%', 'de las compras en un solo comprador (el umbral fija 50%)', 'neg'),
        ('43%', 'utilización de capacidad de las elaboradoras pequeñas en 2023', 'neg'),
        ('Sin acceso', 'de las No Integradas al cupo europeo (Decisión UE 2019/245)', 'neg compacto'),
    ),
    40: _kpis(
        ('2,6 Mt', 'de déficit sin sanción bajo la obligación agregada', 'neg'),
        ('3', 'conceptos que la tabla separa: físico, certificado y crédito'),
    ),
    41: _kpis(
        ('&gt;340.000 t', 'acumuladas por grupos vía plantas "independientes" de 50.000', 'neg compacto'),
        ('≈60%', 'de las compras concentradas en el comprador dominante', 'neg'),
        ('2,6 Mt', 'acumuladas de faltante: bajo el régimen vigente fue la regla', 'neg'),
    ),
    42: _kpis(
        ('1 día', 'después de publicada, el texto base derogaba todo el régimen anterior', 'neg'),
        ('3 años, 3 meses y 27 días', 'demoró la única metodología ordenada por la Ley 27.640', 'neg compacto'),
    ) + _flujo(
        ('Derogación inmediata', 'al día siguiente de la publicación'),
        ('Régimen sustituto inexistente', 'mercado, registros, metodologías y garantías por constituirse'),
        ('Vacío de abastecimiento', 'la duración real del intervalo está documentada'),
    ),
}

# "Sus fundamentos, contra su propio proyecto" (encargo HDO 2026-08-17):
# cada ítem cita TEXTUALMENTE los Fundamentos del proyecto oficial (sección
# final del docx SE, firmada por Bullrich y otros seis), muestra la regla
# del propio articulado que los contradecía y cómo queda con las
# modificaciones. Redacción propia sobre el material del informe rev3 -
# BORRADOR A REVISAR POR HDO. Los números ya están validados en la web.
CONFRONTA_INTRO = (
    'Los fundamentos que acompañan al proyecto oficial declaran objetivos '
    'que el propio articulado desmentía. Cada punto cita textualmente esos '
    'fundamentos, muestra la regla que los contradecía y qué queda de esa '
    'contradicción con las modificaciones propuestas.')

CONFRONTACIONES = [
    dict(
        cita='El proyecto establece que, cumplido el plazo de 12 meses desde su '
             'sanción, deberán elevarse los porcentajes de corte obligatorio de '
             'biocombustibles aplicables al gasoil y a las naftas.',
        boicot='El mismo articulado otorgaba a la Autoridad la facultad de reducir '
               'esos porcentajes por causales abiertas, sin piso, plazo ni orden de '
               'afectación: la herramienta exacta con la que se vació el mandato '
               'durante dieciséis años, con un déficit acumulado de 2,8 millones de '
               'toneladas.',
        corrige='La facultad deja de ser abierta: solo reducción temporal por imposibilidad '
                'técnica o insuficiencia física acreditada, mediante acto fundado y '
                'sin afectar los mínimos. El aumento prometido queda; la puerta de '
                'escape, no.',
        arts=[12, 13]),
    dict(
        cita='Vemos necesario aumentar los porcentajes de mezcla obligatoria ... ya '
             'que tiene un doble efecto positivo: por un lado, disminuye las '
             'emisiones de gases de efecto invernadero y por otro se genera un '
             'beneficio económico a la población.',
        boicot='Cada tonelada de biodiesel no mezclado se sustituyó con gasoil '
               'fósil -en parte importado-: USD 1.059 millones de ganancia para las '
               'mezcladoras y el efecto inverso al declarado sobre emisiones y '
               'balanza comercial. El texto base rehabilitaba ese mecanismo sin '
               'consecuencia alguna por incumplir.',
        corrige='El corte solo puede tocarse por las causas que la propia ley enumera, la importación se limita '
                'a comparaciones entre bienes equivalentes y el incumplimiento pasa '
                'a estar tipificado y sancionado.',
        arts=[12, 26, 33]),
    dict(
        cita='El presente proyecto tiene como uno de sus principales objetivos '
             'garantizar la protección de los consumidores, definiendo '
             'adecuadamente sus derechos.',
        boicot='La experiencia del régimen que replicaba: diez resoluciones de '
               'precio fuera de la metodología legal y dieciséis meses de precios '
               'publicados por debajo de la propia fórmula. La intervención se '
               'dictó invocando al consumidor, pero el ahorro en surtidor fue de '
               'apenas $4,3 por litro: el beneficio directo quedó en el comprador '
               'concentrado.',
        corrige='Se prohíbe fijar, homologar o condicionar precios, las referencias '
                'pasan a ser informativas y el cumplimiento se publica: la '
                'protección del consumidor deja de ser el rótulo de un precio '
                'administrado.',
        arts=[14, 15, 17]),
    dict(
        cita='Busca transicionar hacia un mercado libre donde se genere una '
             'verdadera competencia.',
        boicot='Su mecanismo exigía "acuerdo mutuo" en un mercado donde cuatro '
               'compañías concentran el 98% de la demanda y una sola cerca del '
               '60%: consagraba el poder de veto del comprador dominante, no la '
               'competencia.',
        corrige='Subasta con adjudicación automática por orden de mérito, precio '
                'único de cierre, demanda vinculante y límites por empresa y grupo '
                'económico sobre la totalidad del mandato.',
        arts=[14, 41]),
    dict(
        cita='Se instituye un sistema de comercialización electrónico, transparente '
             'y trazable ... asegurando publicidad, concurrencia, registro de '
             'operaciones y mayor eficiencia en la formación de precios.',
        boicot='El registro del texto base no obligaba a publicar nada: el déficit '
               'de mezcla, los quebrantos y la concentración de compras tuvieron '
               'que reconstruirlos las empresas afectadas e intimarlos a la '
               'Autoridad. Y el contrato a término bilateral quedaba fuera de toda '
               'concurrencia.',
        corrige='Publicación analítica obligatoria -demanda, adjudicaciones, '
                'retiros, incumplimientos y concentración- y todo contrato a '
                'término canalizado por el Mercado Electrónico mediante solicitud '
                'pública.',
        arts=[15, 16]),
    dict(
        cita='A partir de reglas orientadas a la competencia, la transparencia y la '
             'libertad contractual, se busca potenciar el desarrollo de los '
             'biocombustibles, facilitando así el acceso a mercados '
             'internacionales.',
        boicot='La promoción de exportaciones seguía siendo una cláusula '
               'declarativa, con el acceso al cupo europeo de 1.200.000 toneladas '
               'reservado de hecho a las mismas integradas cuya práctica motivó el '
               'cierre de los mercados; las no integradas, sin mecanismo alguno.',
        corrige='El inciso d) se vuelve un deber operativo: gestionar condiciones '
                'de acceso abiertas y no discriminatorias, con certificación '
                'oficial de sustentabilidad y trazabilidad para poder ejercerlas.',
        arts=[5, 39]),
    dict(
        cita='El proyecto también prioriza la reducción de la huella de carbono del '
             'sector energético ... que busca reducir efectivamente el nivel de '
             'emisiones.',
        boicot='Ni un objetivo ni un instrumento reconocía las reducciones '
               'certificadas de 60% a 84% que el biodiesel argentino ya acredita; '
               'y el coprocesado -de menor desempeño y sin certificación- recibía '
               'cómputo contra el corte y exención fiscal por una magnitud que '
               'nadie estaba obligado a medir.',
        corrige='Objetivo expreso de segunda generación, umbral general del 60% '
                'certificado, cómputo exclusivo del componente medido y '
                'certificado, y exención limitada a esa magnitud.',
        arts=[3, 12, 19, 36]),
    dict(
        cita='Se avanza hacia una definición ampliada de biocombustible ... siempre '
             'y cuando se cumplan los requisitos de calidad y sostenibilidad.',
        boicot='Las definiciones que sostienen el régimen -integrada, no integrada, '
               'grupo económico- regían solo durante la transición: las '
               'obligaciones permanentes quedaban sin sujeto determinable, y no '
               'había definición de producto, umbral ni metodología.',
        corrige='Las categorías estructurales pasan al régimen general con vigencia '
                'plena y el grupo económico se ancla en el control y la realidad '
                'económica: la fragmentación societaria ya documentada no se puede '
                'repetir.',
        arts=[6, 38]),
    dict(
        cita='El proyecto contempla un Período de Transición ... fundamental en pos '
             'de asegurar una transición ordenada entre el esquema vigente y las '
             'metas propuestas por esta ley.',
        boicot='Derogaba la Ley 27.640 y toda su reglamentación al día siguiente de '
               'la publicación, con el Mercado Electrónico, los registros y las '
               'garantías todavía inexistentes: la única metodología de precios de '
               'la 27.640 tardó tres años, tres meses y veintisiete días en '
               'dictarse.',
        corrige='La derogación difiere sus efectos hasta que la Autoridad declare '
                'operativo el régimen sustituto: sucesión normativa sin vacío de '
                'abastecimiento.',
        arts=[42]),
]


# Pasajes de la sección FUNDAMENTOS (texto oficial al final de la página)
# que corresponden a cada confrontación, EN EL MISMO ORDEN que
# CONFRONTACIONES. Se encapsulan como .pl-fund-cita: en estado inicial son
# resaltado neutro; el conmutador junto al título los pasa a violeta
# (articulado) o verde (cambios) y el click abre el popup del lado elegido
# (encargo HDO 2026-08-18). Si el docx cambia y un pasaje no matchea, el
# generador corta con error.
FUND_PASAJES = [
    'Asimismo, el proyecto establece que, cumplido el plazo de 12 meses '
    'desde su sanción, deberán elevarse los porcentajes de corte '
    'obligatorio de biocombustibles aplicables al gasoil y a las naftas.',

    'Por otra parte, vemos necesario aumentar los porcentajes de mezcla '
    'obligatoria de biocombustibles con combustibles fósiles, ya que tiene '
    'un doble efecto positivo, por un lado, disminuye las emisiones de '
    'gases de efecto invernadero y por otro se genera un beneficio '
    'económico a la población contribuyendo a diversificar la oferta '
    'energética y moderar la exposición del precio final de los '
    'combustibles a la volatilidad internacional de los hidrocarburos.',

    'El presente proyecto tiene como uno de sus principales objetivos '
    'garantizar la protección de los consumidores, definiendo '
    'adecuadamente sus derechos y permitiendo el acceso a biocombustibles '
    'con estándares de calidad.',

    'Si bien el proyecto respeta determinados parámetros para la '
    'asignación de los volúmenes de corte, busca transicionar hacia un '
    'mercado libre donde se genere una verdadera competencia.',

    'Con el fin de dotar de mayor dinamismo al sector, se instituye un '
    'sistema de comercialización electrónico, transparente y trazable, '
    'destinado a ordenar las operaciones entre productores y mezcladores. '
    'Este mecanismo procura sustituir progresivamente esquemas '
    'administrativos poco flexibles por herramientas de mercado, '
    'asegurando publicidad, concurrencia, registro de operaciones y mayor '
    'eficiencia en la formación de precios.',

    'A partir de reglas orientadas a la competencia, la transparencia y la '
    'libertad contractual, se busca potenciar el desarrollo de los '
    'biocombustibles, facilitando así el acceso a mercados '
    'internacionales.',

    'Asimismo, el proyecto también prioriza la reducción de la huella de '
    'carbono del sector energético a través del desarrollo de '
    'biocombustibles, apuntando a una movilidad sostenible que busca '
    'reducir efectivamente el nivel de emisiones.',

    'Por otra parte, se avanza hacia una definición ampliada de '
    'biocombustible, que incluye los generados a partir de procesos '
    'agropecuarios, agroindustriales, residuos orgánicos y hasta '
    'combustibles sintéticos, siempre y cuando se cumplan los requisitos '
    'de calidad y sostenibilidad.',

    'El proyecto contempla un Período de Transición para el sector de '
    'biodiesel dirigido a conciliar el régimen vigente de la Ley N° 27.640 '
    'con los objetivos del nuevo marco regulatorio. Esto es fundamental en '
    'pos de asegurar una transición ordenada entre el esquema vigente y '
    'las metas propuestas por esta ley.',
]


# Fundamentos alternativos redactados por HDO (2026-08-18) para el cuarto
# estado del conmutador ("Fundamentos propuesta de cambios"): reemplazan por
# completo al texto oficial mientras ese estado está activo.
FUND_PROPUESTA = [
    'Señora Presidenta:',
    'Los biocombustibles cumplen una función estratégica para la seguridad '
    'energética, la diversificación de la matriz de combustibles, el '
    'desarrollo productivo federal y la transición hacia fuentes de energía '
    'con menores emisiones de gases de efecto invernadero. Por esas razones, '
    'las actividades reguladas por la presente iniciativa revisten interés '
    'público y requieren un marco normativo que combine previsibilidad, '
    'inversión, eficiencia, protección de los consumidores y competencia '
    'efectiva.',
    'La declaración de interés público no supone sustituir la iniciativa '
    'privada ni conferir a la Administración facultades para determinar '
    'discrecionalmente los resultados económicos del sector. Significa '
    'reconocer que el abastecimiento, la calidad, el precio y el desempeño '
    'ambiental de los biocombustibles incorporados obligatoriamente a los '
    'combustibles fósiles no resultan indiferentes para el Estado.',
    'En el mercado correspondiente al corte obligatorio, la demanda no surge '
    'exclusivamente de decisiones voluntarias de compradores y consumidores. '
    'Es creada por la ley al imponer la incorporación de determinados '
    'porcentajes de biocombustibles al gasoil y a las naftas. Aunque la '
    'obligación operativa recaiga sobre las empresas encargadas de realizar '
    'la mezcla, el consumidor adquiere y paga el biocombustible como parte '
    'inseparable del combustible final.',
    'Por consiguiente, el Estado que crea esa demanda no puede desentenderse '
    'de las condiciones bajo las cuales será abastecida. Debe procurar que '
    'los volúmenes obligatorios se adjudiquen mediante mecanismos '
    'competitivos, que los precios se formen de manera transparente, que se '
    'asegure la calidad del producto y que la estructura del mercado no '
    'permita trasladar al consumidor los efectos de posiciones dominantes, '
    'integraciones verticales o concentraciones de la oferta y de la '
    'demanda.',
    'Este deber encuentra sustento en el artículo 42 de la Constitución '
    'Nacional, que reconoce el derecho de los consumidores a la protección '
    'de su salud, su seguridad y sus intereses económicos, y encomienda a '
    'las autoridades la defensa de la competencia contra toda forma de '
    'distorsión de los mercados. En un régimen donde el consumo de '
    'biocombustibles resulta indirectamente obligatorio, esas '
    'responsabilidades adquieren particular relevancia.',
    'La iniciativa parte, por ello, de una distinción fundamental entre '
    'mercado libre, libre competencia y libertad contractual.',
    'Un mercado enteramente libre presupone que las partes puedan decidir si '
    'compran o venden, en qué cantidades lo hacen y bajo qué condiciones. '
    'Esa situación no se configura plenamente en el mercado del corte '
    'obligatorio, porque la existencia y el volumen inicial de la demanda '
    'son determinados por la regulación.',
    'La libre competencia, en cambio, consiste en asegurar que los actores '
    'habilitados puedan disputar esa demanda en condiciones objetivas, '
    'transparentes y no discriminatorias. La libertad contractual permite '
    'posteriormente instrumentar las operaciones y celebrar contratos, pero '
    'no puede sustituir las condiciones competitivas que deben existir antes '
    'de la contratación.',
    'En mercados caracterizados por una fuerte concentración de la demanda, '
    'diferencias de integración vertical y un acceso desigual a materias '
    'primas e insumos esenciales, el acuerdo privado no constituye por sí '
    'mismo una garantía de competencia. Puede reflejar una negociación '
    'equilibrada, pero también puede expresar el poder económico de una de '
    'las partes. Por ello, la protección de la libertad contractual debe '
    'complementarse con reglas que preserven el acceso al mercado, eviten '
    'conductas exclusorias y aseguren una concurrencia real entre '
    'oferentes.',
    'Con esa finalidad, el proyecto impulsa un sistema de comercialización '
    'electrónico, transparente y trazable para los volúmenes destinados al '
    'corte obligatorio. El sistema deberá garantizar publicidad, '
    'concurrencia, igualdad de acceso, comparabilidad de las ofertas, '
    'identificación de los grupos económicos participantes y registro '
    'íntegro de las operaciones.',
    'La utilización de procedimientos competitivos de selección, incluidas '
    'las subastas, no implica que el Estado determine administrativamente '
    'quién debe resultar adjudicatario. Su función consiste en establecer '
    'reglas generales, previas e impersonales para que el resultado sea '
    'definido por la competencia entre los oferentes y no por decisiones '
    'discrecionales ni por el poder de negociación derivado de la '
    'concentración económica.',
    'El mecanismo deberá procurar el abastecimiento de los volúmenes '
    'obligatorios al menor precio resultante de una competencia efectiva, '
    'compatible con la calidad exigida, la continuidad del suministro y los '
    'objetivos ambientales del régimen. La eficiencia no se alcanza '
    'mediante la simple ausencia de intervención, sino mediante '
    'procedimientos que permitan comparar ofertas y seleccionar aquellas '
    'que satisfagan del mejor modo los objetivos públicos establecidos.',
    'La regulación deberá asimismo reconocer las diferencias estructurales '
    'existentes entre los participantes. Un producto puede ser homogéneo en '
    'su especificación técnica sin que sean homogéneos los actores que lo '
    'producen. La integración vertical, el control de la materia prima, la '
    'pertenencia a un mismo grupo económico, la vinculación con los '
    'compradores y el acceso privilegiado a insumos esenciales pueden '
    'modificar sustancialmente la capacidad de competir.',
    'Las categorías regulatorias no deben mantenerse por privilegio ni '
    'eliminarse únicamente por el transcurso del tiempo. Deben conservarse '
    'mientras subsistan las diferencias objetivas que justificaron su '
    'existencia y revisarse cuando esas condiciones se modifiquen. La fecha '
    'de un calendario puede establecer una instancia de evaluación, pero no '
    'puede convertir por sí sola en equivalentes a actores que continúan '
    'ocupando posiciones económicas diferentes.',
    'El régimen también debe promover una transición energética '
    'ambientalmente verificable. La incorporación de un combustible a la '
    'definición legal de biocombustible o el cumplimiento de una '
    'especificación de calidad no demuestran, por sí solos, una reducción '
    'efectiva de emisiones. Los beneficios ambientales deberán evaluarse '
    'mediante criterios objetivos, metodologías reconocidas y '
    'certificaciones que consideren el ciclo de vida de cada producto y '
    'proceso.',
    'Este criterio permitirá distinguir y valorar adecuadamente a los '
    'biocombustibles que acrediten mayores reducciones de gases de efecto '
    'invernadero, incluidos los obtenidos mediante materias primas '
    'residuales, procesos avanzados o tecnologías de segunda generación. La '
    'regulación debe evitar que productos con diferente desempeño ambiental '
    'reciban el mismo tratamiento cuando esa equiparación desaliente '
    'inversiones destinadas a reducir emisiones.',
    'Del mismo modo, cualquier incremento de los porcentajes obligatorios '
    'de mezcla deberá considerar conjuntamente la disponibilidad de '
    'producto, la capacidad instalada, su incidencia sobre el precio final, '
    'la seguridad de abastecimiento y la reducción certificada de '
    'emisiones. El aumento del corte no constituye un fin autónomo, sino un '
    'instrumento para alcanzar objetivos energéticos, económicos y '
    'ambientales que deben ser comprobables.',
    'La ampliación de la definición de biocombustibles permitirá incorporar '
    'nuevas materias primas, procesos y tecnologías, siempre que cumplan '
    'requisitos verificables de calidad, sostenibilidad y desempeño '
    'ambiental. Asimismo, se promoverá el desarrollo del biogás, el '
    'biometano, los combustibles sostenibles de aviación y otras '
    'alternativas capaces de contribuir a la descarbonización del '
    'transporte y a la valorización de recursos productivos regionales.',
    'El proyecto habilita también la comercialización voluntaria de '
    'combustibles con porcentajes de biocombustibles superiores a los '
    'obligatorios. En ese segmento, donde el consumidor puede elegir entre '
    'distintas alternativas, la libertad contractual y la iniciativa '
    'privada podrán desplegarse con mayor amplitud, sujetas únicamente a '
    'las exigencias de calidad, seguridad, información y protección de la '
    'competencia.',
    'La promoción de las exportaciones constituye otro objetivo relevante '
    'para ampliar la escala productiva, generar divisas e integrar a la '
    'Argentina en los mercados internacionales de energías renovables. Sin '
    'embargo, ese objetivo deberá armonizarse con la seguridad energética y '
    'con el abastecimiento interno. La expansión exportadora no puede '
    'comprometer el cumplimiento eficiente de la demanda obligatoria ni '
    'trasladar al consumidor local costos derivados de una insuficiencia '
    'artificial de oferta.',
    'La autoridad de aplicación tendrá a su cargo implementar y fiscalizar '
    'el régimen, verificar el cumplimiento de las condiciones técnicas y '
    'ambientales, garantizar la transparencia del sistema de '
    'comercialización y prevenir distorsiones que afecten el abastecimiento '
    'o la competencia. Sus facultades deberán ejercerse con arreglo a '
    'criterios objetivos, públicos y controlables, evitando tanto la '
    'discrecionalidad administrativa como la apropiación privada de la '
    'demanda creada por la ley.',
    'El período de transición deberá permitir la adaptación progresiva de '
    'los participantes sin alterar abruptamente las condiciones de '
    'abastecimiento ni excluir actores por la sola llegada de una fecha. Su '
    'evolución deberá apoyarse en evaluaciones periódicas de la estructura '
    'del mercado, el grado de concentración, el acceso a materias primas e '
    'insumos, la participación de los distintos grupos económicos y la '
    'existencia de competencia efectiva.',
    'La finalidad de la transición no es sustituir un régimen regulado por '
    'un espacio carente de reglas. Es avanzar desde mecanismos '
    'administrativos discrecionales hacia una regulación competitiva, '
    'apoyada en procedimientos transparentes y resultados verificables. El '
    'Estado no debe elegir a los ganadores, pero tampoco puede permitir que '
    'la estructura económica los determine antes de que comience la '
    'competencia.',
    'En síntesis, la iniciativa propone un régimen moderno y previsible que '
    'reconoce la naturaleza de interés público de los biocombustibles, '
    'protege a los consumidores, promueve inversiones y exportaciones, '
    'impulsa reducciones certificadas de emisiones y garantiza que la '
    'demanda obligatoria sea abastecida mediante competencia efectiva.',
    'No se trata de optar entre regulación y libertad. Se trata de '
    'establecer una regulación que haga posible la competencia allí donde '
    'la propia ley crea la demanda y donde la concentración económica '
    'impide presumir que los acuerdos privados producirán, por sí solos, '
    'resultados eficientes y equitativos.',
    'Por los motivos expuestos, solicitamos a nuestros pares el '
    'acompañamiento y la aprobación del presente proyecto de ley.',
]


def marcar_fundamentos(ley):
    """Encapsula los 9 pasajes citados, agrega el conmutador al título y
    deja el cuerpo oficial y el propuesto como variantes intercambiables."""
    h2 = '<h2 class="pl-titulo">FUNDAMENTOS </h2>'
    if ley.count(h2) != 1:
        sys.exit('ERROR: no encontré el título FUNDAMENTOS para el conmutador')
    h2_nuevo = ('<h2 class="pl-titulo pl-fund-titulo"><span>FUNDAMENTOS</span>'
                '<span class="pl-fund-ctrl">'
                '<button type="button" class="pl-oblea pl-fund-toggle" '
                'data-estado="inicial">Estado inicial</button>'
                '<span class="pl-fund-leyenda">Oprimir para confrontar estos '
                'fundamentos con el articulado</span>'
                '</span></h2>')
    ley = ley.replace(h2, h2_nuevo)
    for n, pasaje in enumerate(FUND_PASAJES, 1):
        esc = html.escape(pasaje, quote=False)
        if ley.count(esc) != 1:
            sys.exit(f'ERROR: pasaje {n} de FUNDAMENTOS no matchea el docx '
                     f'(¿cambió el texto?): {pasaje[:60]}...')
        ley = ley.replace(
            esc, f'<span class="pl-fund-cita" data-conf="{n}">{esc}</span>')
    # variantes: el texto oficial (con cápsulas) vs. los fundamentos
    # propuestos por HDO; el CSS muestra una según data-fund del cuerpo
    corte = ley.find(h2_nuevo) + len(h2_nuevo)
    propuesta = '\n'.join(
        f'<p>{html.escape(p, quote=False)}</p>' for p in FUND_PROPUESTA)
    return (ley[:corte]
            + '\n<div class="pl-fund-oficial">' + ley[corte:] + '\n</div>'
            + '\n<div class="pl-fund-propuesta">\n' + propuesta + '\n</div>')


def generar_confrontaciones():
    partes = [f'<p class="pl-conf-intro">{html.escape(CONFRONTA_INTRO)}</p>']
    for c in CONFRONTACIONES:
        chips = ''.join(
            f'<button type="button" class="pl-salto" data-art="{a}">Artículo {a}</button>'
            for a in c['arts'])
        partes.append(
            '<div class="pl-conf">'
            f'<blockquote class="pl-conf-cita">{html.escape(c["cita"])}'
            '<cite>Fundamentos del proyecto oficial</cite></blockquote>'
            '<div class="pl-conf-cols">'
            '<div class="pl-conf-col pl-conf-boicot"><h5>Lo que hacía su articulado</h5>'
            f'<p>{html.escape(c["boicot"])}</p></div>'
            '<div class="pl-conf-col pl-conf-corrige"><h5>Con las modificaciones</h5>'
            f'<p>{html.escape(c["corrige"])}</p></div>'
            '</div>'
            f'<div class="pl-conf-arts">{chips}</div>'
            '</div>')
    pops = ('<div class="pl-pop" data-art="intro" data-tipo="confronta" '
            'data-titulo="Sus fundamentos, contra su propio proyecto" '
            'data-sub="Proyecto oficial S-0809/2026">'
            + ''.join(partes) + '</div>')
    # popups por confrontación para las cápsulas de la sección FUNDAMENTOS:
    # un lado por estado del conmutador (articulado=violeta / cambios=verde)
    for n, c in enumerate(CONFRONTACIONES, 1):
        chips = ''.join(
            f'<button type="button" class="pl-salto" data-art="{a}">Artículo {a}</button>'
            for a in c['arts'])
        for tipo, campo, sub, titulo in (
                ('articulado', 'boicot', 'Inconsistencia',
                 'Con el articulado del proyecto oficial NO CUMPLE CON EL '
                 'FUNDAMENTO QUE DECLARA'),
                ('cambios', 'corrige', 'Fundamentos · Proyecto oficial S-0809/2026',
                 'Con las modificaciones propuestas al articulado CUMPLE CON '
                 'LOS FUNDAMENTOS PROPUESTOS POR EL PROYECTO DE BULLRICH')):
            pops += (
                f'<div class="pl-pop" data-art="conf-{n}" data-tipo="{tipo}" '
                f'data-titulo="{titulo}" data-sub="{sub}">'
                f'<p>{html.escape(c[campo])}</p>'
                f'<div class="pl-conf-arts">{chips}</div></div>')
    return pops


# Imágenes estáticas del popup de hechos (infografías de HDO en
# public/evidencia/). Van después del texto, antes de los gráficos.
# Click = abrir a tamaño completo en otra pestaña.
IMAGENES = {
    5: [('/evidencia/crecimiento-integradas.png',
         'Evolución de la capacidad de producción de biodiesel de las '
         'empresas integradas 2008-2025, con los ingresos por diferencial '
         'de retenciones y por venta de aceite con premio')],
    6: [('/evidencia/cronologia-normativa-2006-2010.png',
         'Cronología normativa del biodiesel 2006-2010 en el mercado '
         'interno: Ley 26.093, Decreto 109/2007, Resoluciones 6 y 7, '
         '554/2010 y 1674/2010'),
        ('/evidencia/crecimiento-no-integradas.png',
         'Evolución de la capacidad de producción de biodiesel de las '
         'empresas no integradas 2008-2025: plantas de 50.000 toneladas, '
         'grupos económicos y capacidad total del segmento')],
}

# Gráficos de evidencia por artículo (ids del registro HECHOS_CHARTS en
# src/components/propuesta/HechosCharts.jsx; se montan por portal sobre los
# placeholders .pl-chart del popup). Datos: src/data/*.json del dashboard.
CHARTS = {
    5: ['asimetria-escala', 'retenciones', 'categorias-comparadas', 'grupos-aceiteras'],
    6: ['grupos-aceiteras'],
    10: ['secretarios'],
    # corte-serie y eficacia-gestiones van inline en el override (después de
    # los párrafos 1 y 2); acá solo lo que cierra el popup
    12: ['petroleras-cumplimiento'],
    13: ['corte-serie'],
    14: ['precio-formula', 'concentracion-compradores', 'demanda-petroleras'],
    15: ['deficit', 'asignacion-ventas'],
    17: ['metanol'],
    20: ['aceite-fas', 'metanol'],
    26: ['corte-real-go'],
    28: ['deficit'],
    38: ['grupos-aceiteras'],
    39: ['utilizacion', 'categorias-comparadas', 'concentracion-compradores'],
    41: ['grupos-aceiteras', 'concentracion-compradores'],
    42: ['formulas-precios'],
}


def intercalar_charts(texto, charts):
    """Reparte los gráficos dentro del texto del popup, uno después de cada
    párrafo (patrón aprobado en el art. 12); los que sobran van al final.
    Si el texto ya trae placeholders (override con posiciones propias), los
    de CHARTS se agregan al final sin tocar el intercalado manual."""
    marca = '<div class="pl-chart" data-chart="{}"></div>'
    if not charts:
        return texto
    if 'pl-chart' in texto:
        return texto + ''.join(marca.format(c) for c in charts)
    partes = texto.split('</p>')
    out, ci = [], 0
    for parte in partes[:-1]:
        out.append(parte + '</p>')
        if ci < len(charts):
            out.append(marca.format(charts[ci]))
            ci += 1
    out.append(partes[-1])
    out.extend(marca.format(c) for c in charts[ci:])
    return ''.join(out)

# Artículos con modificaciones que no violan norma alguna: llevan solo la
# oblea de Justificación, con texto dictado por HDO (2026-08-10).
JUST_SOLO = {}

# Consistencia del Cuadro de correspondencia con las decisiones de HDO:
# filas reemplazadas (el informe v8 traía otra cosa) o agregadas (3 y 5 no
# figuraban). Columnas: Modificación · Norma comprometida · Efecto.
CUADRO_FILAS = {}


# ── numeración automática ──────────────────────────────────────────────
def roman(n):
    vals = [(1000,'m'),(900,'cm'),(500,'d'),(400,'cd'),(100,'c'),(90,'xc'),
            (50,'l'),(40,'xl'),(10,'x'),(9,'ix'),(5,'v'),(4,'iv'),(1,'i')]
    out = ''
    for v, s in vals:
        while n >= v:
            out += s; n -= v
    return out

def letra(n):
    out = ''
    while n > 0:
        n, r = divmod(n - 1, 26)
        out = chr(ord('a') + r) + out
    return out

def fmt_num(fmt, n):
    if fmt == 'decimal': return str(n)
    if fmt == 'lowerLetter': return letra(n)
    if fmt == 'upperLetter': return letra(n).upper()
    if fmt == 'lowerRoman': return roman(n)
    if fmt == 'upperRoman': return roman(n).upper()
    if fmt in ('bullet', 'none'): return ''
    return str(n)

class Numeracion:
    def __init__(self, z):
        self.defs = {}     # numId -> {ilvl: (start, fmt, lvlText)}
        self.contador = {} # (numId) -> {ilvl: n}
        try:
            xml = z.read('word/numbering.xml')
        except KeyError:
            return
        root = ET.fromstring(xml)
        abstractos = {}
        for a in root.findall(W + 'abstractNum'):
            aid = a.get(W + 'abstractNumId')
            lvls = {}
            for l in a.findall(W + 'lvl'):
                ilvl = int(l.get(W + 'ilvl'))
                start = l.find(W + 'start')
                nf = l.find(W + 'numFmt')
                lt = l.find(W + 'lvlText')
                lvls[ilvl] = (
                    int(start.get(W + 'val')) if start is not None else 1,
                    nf.get(W + 'val') if nf is not None else 'decimal',
                    lt.get(W + 'val') if lt is not None else '%1.',
                )
            abstractos[aid] = lvls
        for n in root.findall(W + 'num'):
            nid = n.get(W + 'numId')
            ref = n.find(W + 'abstractNumId')
            lvls = dict(abstractos.get(ref.get(W + 'val'), {})) if ref is not None else {}
            for ov in n.findall(W + 'lvlOverride'):
                ilvl = int(ov.get(W + 'ilvl'))
                so = ov.find(W + 'startOverride')
                if so is not None and ilvl in lvls:
                    s, f, t = lvls[ilvl]
                    lvls[ilvl] = (int(so.get(W + 'val')), f, t)
            self.defs[nid] = lvls

    def etiqueta(self, num_id, ilvl):
        lvls = self.defs.get(num_id)
        if not lvls or ilvl not in lvls:
            return ''
        cnt = self.contador.setdefault(num_id, {})
        cnt[ilvl] = cnt.get(ilvl, lvls[ilvl][0] - 1) + 1
        for deeper in [l for l in cnt if l > ilvl]:
            del cnt[deeper]
        start, fmt, texto = lvls[ilvl]
        if fmt in ('bullet', 'none'):
            return '·'
        out = texto
        for l in range(9):
            if f'%{l+1}' in out:
                n = cnt.get(l, lvls.get(l, (1,))[0])
                f_l = lvls.get(l, (1, 'decimal', ''))[1]
                out = out.replace(f'%{l+1}', fmt_num(f_l, n))
        return out


# ── extracción de párrafos/tablas ──────────────────────────────────────
def run_fmt(r):
    rpr = r.find(W + 'rPr')
    fmt = ''
    if rpr is not None:
        def on(tag):
            el = rpr.find(W + tag)
            if el is None: return False
            return el.get(W + 'val') not in ('0', 'false', 'none')
        if on('b'): fmt += 'b'
        if on('i'): fmt += 'i'
    return fmt

def run_text(r):
    parts = []
    for node in r.iter():
        if node.tag in (W + 't', W + 'delText'):
            parts.append(node.text or '')
        elif node.tag == W + 'tab':
            parts.append('\t')
        elif node.tag == W + 'br':
            parts.append('\n')
    # HDO (2026-08-17): guion simple en todos los textos, nunca rayas
    texto = ''.join(parts).replace('—', '-').replace('–', '-')
    for viejo, nuevo in CORRECCIONES.items():
        texto = texto.replace(viejo, nuevo)
    return texto

def runs_de(p):
    runs = []
    def emit(kind, r):
        t = run_text(r)
        if t:
            runs.append((kind, t, run_fmt(r)))
    def walk(el, kind):
        for child in el:
            if child.tag == W + 'r':
                emit(kind, child)
            elif child.tag in (W + 'ins', W + 'moveTo'):
                walk(child, 'ins')
            elif child.tag in (W + 'del', W + 'moveFrom'):
                walk(child, 'del')
            elif child.tag in (W + 'smartTag', W + 'hyperlink'):
                walk(child, kind)
    walk(p, 'orig')
    return runs

def info_p(p, num):
    ppr = p.find(W + 'pPr')
    style = ''
    etiqueta = ''
    if ppr is not None:
        st = ppr.find(W + 'pStyle')
        style = st.get(W + 'val') if st is not None else ''
        npr = ppr.find(W + 'numPr')
        if npr is not None:
            nid = npr.find(W + 'numId')
            ilvl = npr.find(W + 'ilvl')
            if nid is not None:
                runs = runs_de(p)
                vivo = any(k != 'del' for k, t, f in runs if t.strip())
                if vivo:
                    etiqueta = num.etiqueta(nid.get(W + 'val'),
                                            int(ilvl.get(W + 'val')) if ilvl is not None else 0)
    return style, etiqueta

def extraer(path):
    """Lista de bloques: {'tipo':'p', ...} | {'tipo':'tabla', 'filas':[[celda...]]}
    celda = lista de párrafos."""
    z = zipfile.ZipFile(path)
    num = Numeracion(z)
    root = ET.fromstring(z.read('word/document.xml'))
    body = root.find(W + 'body')
    bloques = []
    def parrafo(p):
        style, etiqueta = info_p(p, num)
        return {'tipo': 'p', 'style': style, 'etiqueta': etiqueta, 'runs': runs_de(p)}
    for child in body:
        if child.tag == W + 'p':
            bloques.append(parrafo(child))
        elif child.tag == W + 'tbl':
            filas = []
            for tr in child.findall(W + 'tr'):
                fila = []
                for tc in tr.findall(W + 'tc'):
                    tcpr = tc.find(W + 'tcPr')
                    vm = tcpr.find(W + 'vMerge') if tcpr is not None else None
                    vmerge = None
                    if vm is not None:
                        vmerge = 'restart' if vm.get(W + 'val') == 'restart' else 'cont'
                    fila.append({'vmerge': vmerge,
                                 'parrafos': [parrafo(p) for p in tc.findall(W + 'p')]})
                if fila:
                    filas.append(fila)
            bloques.append({'tipo': 'tabla', 'filas': filas})
    return bloques


# ── render HTML ────────────────────────────────────────────────────────
def render_runs(runs):
    """Texto final: orig + ins (los del se descartan). ins → <ins>."""
    out = []
    for kind, texto, fmt in runs:
        if kind == 'del' or not texto:
            continue
        t = html.escape(texto).replace('\n', '<br/>')
        if 'b' in fmt: t = f'<strong>{t}</strong>'
        if 'i' in fmt: t = f'<em>{t}</em>'
        out.append((kind, t))
    # fusionar <ins> contiguos
    partes = []
    for kind, t in out:
        if kind == 'ins' and partes and partes[-1][0] == 'ins':
            partes[-1][1] += t
        else:
            partes.append([kind, t])
    return ''.join(f'<ins>{t}</ins>' if k == 'ins' else t for k, t in partes)

def texto_final(runs):
    return ''.join(t for k, t, f in runs if k != 'del')

def render_p(b, clase=''):
    cuerpo = render_runs(b['runs'])
    if not cuerpo.strip():
        return ''
    if b['etiqueta']:
        cuerpo = f'<span class="pl-inciso">{html.escape(b["etiqueta"])}</span> {cuerpo}'
        clase = (clase + ' pl-li').strip()
    attr = f' class="{clase}"' if clase else ''
    return f'<p{attr}>{cuerpo}</p>'

def render_tabla(b, clase='pl-tabla'):
    """Respeta los merges verticales del docx: la celda 'restart' toma
    rowspan por las 'cont' que la siguen en su columna, centrada."""
    def fila_vacia(fila):
        return all(not texto_final(p['runs']).strip()
                   for c in fila for p in c['parrafos'])
    filas_src = [f for f in b['filas'] if not fila_vacia(f)]
    if not filas_src:
        return ''
    filas = []
    for i, fila in enumerate(filas_src):
        tag = 'th' if i == 0 else 'td'
        celdas = []
        for j, celda in enumerate(fila):
            if celda['vmerge'] == 'cont':
                continue
            # clase por columna real (j cuenta también las celdas 'cont',
            # así que sobrevive a los rowspan)
            clases = [f'pl-c{j + 1}'] if j < 2 else []
            rowspan = ''
            if celda['vmerge'] == 'restart':
                span = 1
                for sig in filas_src[i + 1:]:
                    if j < len(sig) and sig[j]['vmerge'] == 'cont':
                        span += 1
                    else:
                        break
                if span > 1:
                    rowspan = f' rowspan="{span}"'
                    clases.append('pl-celda-merge')
            attrs = rowspan + (f' class="{" ".join(clases)}"' if clases else '')
            inner = ''.join(render_p(p) for p in celda['parrafos']) or '<p>&nbsp;</p>'
            celdas.append(f'<{tag}{attrs}>{inner}</{tag}>')
        filas.append('<tr>' + ''.join(celdas) + '</tr>')
    return (f'<div class="pl-tabla-scroll"><table class="{clase}">'
            + ''.join(filas) + '</table></div>')


# ── propuesta → cuerpo de la ley ───────────────────────────────────────
def generar_ley(bloques):
    out = []
    seccion = None      # nro de artículo abierto
    hay_mod = False     # el artículo abierto tiene <ins> o <del>

    def cerrar():
        nonlocal seccion, hay_mod
        if seccion is None:
            return
        if seccion in ARTS_INFORME:
            out.append(
                '<div class="pl-obleas">'
                f'<button type="button" class="pl-oblea pl-oblea-normas" data-art="{seccion}" data-tipo="normas">'
                'Normas que viola el proyecto oficial</button>'
                f'<button type="button" class="pl-oblea pl-oblea-just" data-art="{seccion}" data-tipo="just">'
                'Justificación de la modificación</button>'
                f'<button type="button" class="pl-oblea pl-oblea-hechos" data-art="{seccion}" data-tipo="hechos">'
                'Respaldo en datos</button>'
                '</div>')
        elif seccion in JUST_SOLO:
            out.append(
                '<div class="pl-obleas">'
                f'<button type="button" class="pl-oblea pl-oblea-just" data-art="{seccion}" data-tipo="just">'
                'Justificación de la modificación</button>'
                '</div>')
        out.append('</section>')
        seccion = None
        hay_mod = False

    for b in bloques:
        if b['tipo'] == 'tabla':
            out.append(render_tabla(b))
            continue
        txt = texto_final(b['runs']).strip()
        if not txt:
            continue
        style = b['style']
        m = re.match(r'ART[IÍ]CULO\s+(\d+)', txt)
        if m:
            cerrar()
            nro = int(m.group(1))
            seccion = nro
            clases = 'pl-art' + (' pl-art-informe' if nro in ARTS_INFORME or nro in JUST_SOLO else '')
            out.append(f'<section class="{clases}" id="art-{nro}">')
            out.append(render_p(b, 'pl-art-p1'))
            continue
        if style == 'Heading1':
            cerrar()
            out.append(f'<h2 class="pl-titulo">{render_runs(b["runs"])}</h2>')
            continue
        if style == 'Heading2':
            cerrar()
            out.append(f'<h3 class="pl-capitulo">{render_runs(b["runs"])}</h3>')
            continue
        if seccion is None:
            # portada: (S-0809/2026), PROYECTO DE LEY, fórmula de sanción
            if txt == 'PROYECTO DE LEY':
                out.append(f'<p class="pl-rotulo">{html.escape(txt)}</p>')
            elif re.match(r'\(S-', txt):
                out.append(f'<p class="pl-expediente">{html.escape(txt)}</p>')
            else:
                out.append(render_p(b))
            continue
        out.append(render_p(b))
    cerrar()
    return '\n'.join(out)


# ── informe → intro + popups + cierre ──────────────────────────────────
def strip_lead(parrafos, lead):
    """Quita el rótulo en negrita ('Normas violadas.') del primer párrafo,
    consumiéndolo a nivel de runs (Word lo parte en varios)."""
    out = []
    primero = True
    for b in parrafos:
        if primero and b['tipo'] == 'p':
            vivo = ''.join(t for k, t, f in b['runs'] if k != 'del')
            if vivo.lstrip().startswith(lead):
                corte = vivo.index(lead) + len(lead)
                while corte < len(vivo) and vivo[corte] == ' ':
                    corte += 1
                runs = []
                pos = 0
                for kind, texto, fmt in b['runs']:
                    if kind == 'del':
                        runs.append((kind, texto, fmt))
                        continue
                    ini, pos = pos, pos + len(texto)
                    if pos <= corte:
                        continue
                    runs.append((kind, texto[max(corte - ini, 0):], fmt))
                b = dict(b, runs=runs)
            primero = False
        out.append(render_p(b) if b['tipo'] == 'p' else render_tabla(b))
    return ''.join(out)

def seccionar(bloques):
    """{titulo Heading2 -> bloques} + orden de aparición."""
    secciones = {}
    orden = []
    actual = None
    for b in bloques:
        if b['tipo'] == 'p' and b['style'] == 'Heading2':
            actual = texto_final(b['runs']).strip()
            secciones[actual] = []
            orden.append(actual)
            continue
        if b['tipo'] == 'p' and b['style'] == 'Heading1':
            continue
        if actual is not None:
            secciones[actual].append(b)
    return secciones, orden


# Secciones nuevas del AMPLIADO_DATOS → popup de la intro que las absorbe
# (decisión HDO 2026-08-17: dentro de las obleas existentes, sin obleas nuevas)
AMPL_EN_POPUP = {
    'objeto': ['Método de prueba y estándar de afirmación'],
    'cuadro': ['Síntesis ejecutiva de la evidencia'],
    'cierre': ['Conclusión fáctica', 'Anexo I'],
}


def render_seccion_ampl(secciones_ampl, prefijo):
    """Sección del AMPLIADO (por prefijo del título) como bloque anexo con
    su subtítulo. Los párrafos vacíos y las imágenes ya no existen a esta
    altura (extraer() ignora los drawings)."""
    titulo = next((t for t in secciones_ampl if t.startswith(prefijo)), None)
    if titulo is None:
        sys.exit(f'ERROR: el AMPLIADO no tiene la sección "{prefijo}…"')
    cuerpo = ''.join(render_p(b) if b['tipo'] == 'p' else render_tabla(b)
                     for b in secciones_ampl[titulo])
    return f'<div class="pl-pop-anexo"><h4>{html.escape(titulo)}</h4>{cuerpo}</div>'


def tablas_evidencia_ampl(secciones_ampl, nro):
    """Tablas de la sección del artículo en el AMPLIADO (solo la zona de
    evidencia las tiene). Se anexan al popup de hechos. El título se busca
    por número por si difiere en algo del rev3."""
    titulo = next((t for t in secciones_ampl
                   if re.match(rf'Art[ií]culo\s+{nro}\b', t)), None)
    out = []
    for b in secciones_ampl.get(titulo, []):
        if b['tipo'] == 'tabla':
            out.append(render_tabla(b))
    return ''.join(out)


def generar_informe(bloques, ampliado):
    secciones, orden = seccionar(bloques)
    secciones_ampl, _ = seccionar(ampliado)

    # popups de la intro (Objeto / Marco / Cuadro); las obleas que los abren
    # viven en el JSX, dentro del encabezado fijo
    INTRO = [('objeto', 'Objeto y método', 'Objeto y método'),
             ('marco', 'Marco normativo de referencia', 'Marco normativo de referencia'),
             ('cuadro', 'Cuadro de correspondencia', 'Cuadro de correspondencia'),
             ('cierre', 'Cierre', 'Criterio para modificaciones')]
    pops_intro = []
    for clave, titulo, rotulo in INTRO:
        cuerpo = []
        if clave == 'cuadro':
            cuerpo.append('<p class="pl-cuadro-ayuda">Cada fila lleva al artículo modificado.</p>')
        for b in secciones.get(titulo, []):
            if b['tipo'] == 'p':
                cuerpo.append(render_p(b))
            elif b['tipo'] == 'tabla':
                filas = []
                # filas como (nro, html_celdas) para poder reemplazar/insertar
                encabezado = ''
                datos = []
                for i, fila in enumerate(b['filas']):
                    if i == 0:
                        celdas = ''.join(
                            '<th>' + (''.join(render_p(p) for p in c['parrafos']) or '&nbsp;') + '</th>'
                            for c in fila)
                        encabezado = '<tr>' + celdas + '</tr>'
                        continue
                    m_nro = re.match(r'(\d+)', texto_final(fila[0]['parrafos'][0]['runs']).strip())
                    nro = int(m_nro.group(1)) if m_nro else None
                    if nro in CUADRO_FILAS:
                        continue  # la versión de HDO reemplaza a la del docx
                    celdas = ''.join(
                        '<td>' + (''.join(render_p(p) for p in c['parrafos']) or '&nbsp;') + '</td>'
                        for c in fila)
                    datos.append((nro if nro is not None else 999, nro, celdas))
                for nro, (c1, c2, c3, c4) in CUADRO_FILAS.items():
                    celdas = ''.join(f'<td><p>{html.escape(t)}</p></td>' for t in (c1, c2, c3, c4))
                    datos.append((nro, nro, celdas))
                datos.sort(key=lambda d: d[0])
                filas.append(encabezado)
                for _, nro, celdas in datos:
                    attr = f' class="pl-cuadro-fila" data-art="{nro}"' if nro is not None else ''
                    filas.append(f'<tr{attr}>' + celdas + '</tr>')
                cuerpo.append('<div class="pl-tabla-scroll"><table class="pl-cuadro">'
                              + ''.join(filas) + '</table></div>')
        for prefijo in AMPL_EN_POPUP.get(clave, []):
            cuerpo.append(render_seccion_ampl(secciones_ampl, prefijo))
        pops_intro.append(f'<div class="pl-pop" data-art="intro" data-tipo="{clave}" '
                          f'data-titulo="{html.escape(rotulo)}" data-sub="Informe de fundamentos">'
                          + ''.join(cuerpo) + '</div>')

    # popups por artículo
    pops = ['<div class="pl-popups" hidden>'] + pops_intro
    pops.append(generar_confrontaciones())
    for nro, (titulo, texto) in JUST_SOLO.items():
        pops.append(f'<div class="pl-pop" data-art="{nro}" data-tipo="just" '
                    f'data-titulo="{html.escape(titulo)}" data-sub="Justificación de la modificación">'
                    + texto + '</div>')
    for titulo in orden:
        m = re.match(r'Art[ií]culo\s+(\d+)', titulo)
        if not m:
            continue
        nro = int(m.group(1))
        if nro in JUST_SOLO:
            # el texto dictado por HDO reemplaza por completo a la sección
            # del informe (p.ej. art. 40: no hay violación normativa)
            continue
        normas, just, hechos = [], [], []
        balde = None
        for b in secciones[titulo]:
            if b['tipo'] != 'p':
                (balde if balde is not None else normas).append(b)
                continue
            txt = texto_final(b['runs']).strip()
            if txt.startswith('Normas violadas'):
                balde = normas
            elif txt.startswith('Justificación de la modificación'):
                balde = just
            elif txt.startswith('Evidencia fáctica'):
                balde = hechos
            if balde is not None:
                balde.append(b)
        tit = html.escape(titulo.replace('- ', ' · ', 1))
        html_normas = OVERRIDES.get((nro, 'normas')) or strip_lead(normas, 'Normas violadas.')
        html_just = OVERRIDES.get((nro, 'just')) or strip_lead(just, 'Justificación de la modificación.')
        html_hechos = OVERRIDES.get((nro, 'hechos')) or strip_lead(hechos, 'Evidencia fáctica.')
        if not html_hechos.strip():
            sys.exit(f'ERROR: artículo {nro} sin párrafos de Evidencia fáctica')
        html_hechos = intercalar_charts(html_hechos, CHARTS.get(nro, []))
        html_hechos = HECHOS_DESTACADOS.get(nro, '') + html_hechos
        html_hechos += ''.join(
            f'<figure class="pl-imagen"><a href="{src}" target="_blank" rel="noopener">'
            f'<img src="{src}" alt="{html.escape(alt)}" loading="lazy"/></a>'
            '<figcaption>Click para ampliar</figcaption></figure>'
            for src, alt in IMAGENES.get(nro, []))
        html_hechos += tablas_evidencia_ampl(secciones_ampl, nro)
        pops.append(f'<div class="pl-pop" data-art="{nro}" data-tipo="normas" '
                    f'data-titulo="{tit}" data-sub="Normas que viola el proyecto oficial">'
                    + html_normas + '</div>')
        pops.append(f'<div class="pl-pop" data-art="{nro}" data-tipo="just" '
                    f'data-titulo="{tit}" data-sub="Justificación de la modificación">'
                    + html_just + '</div>')
        pops.append(f'<div class="pl-pop" data-art="{nro}" data-tipo="hechos" '
                    f'data-titulo="{tit}" data-sub="Respaldo en datos">'
                    + html_hechos + '</div>')
    pops.append('</div>')

    return '\n'.join(pops)


def fusionar_encabezados(bloques):
    """Un 'ARTÍCULO N.-' que quedó como párrafo suelto (quirk del cc del
    11/08 en el art. 17) se fusiona con el párrafo siguiente."""
    out = []
    i = 0
    while i < len(bloques):
        b = bloques[i]
        if (b['tipo'] == 'p'
                and re.fullmatch(r'ART[IÍ]CULO\s+\d+\.?-?', texto_final(b['runs']).strip())
                and i + 1 < len(bloques) and bloques[i + 1]['tipo'] == 'p'):
            sig = bloques[i + 1]
            pegote = [] if texto_final(b['runs']).endswith(' ') else [('orig', ' ', '')]
            out.append(dict(sig, style=b['style'] or sig['style'],
                            runs=b['runs'] + pegote + sig['runs']))
            i += 2
            continue
        out.append(b)
        i += 1
    return out


def main():
    prop = fusionar_encabezados(extraer(DOCX_PROP))
    inf = extraer(DOCX_INF)
    ampl = extraer(DOCX_AMPL)
    pops = generar_informe(inf, ampl)
    ley = marcar_fundamentos(generar_ley(prop))
    doc = (
        '<!-- Generado desde los docx de HDO (propuesta cc 11/08 + informe\n'
        '     Evidencia fáctica rev3 del 17/08 + AMPLIADO_DATOS).\n'
        '     Script: scripts/generar_propuesta_html.py — no editar a mano\n'
        '     los textos legales; regenerar desde el docx. -->\n'
        f'<div class="pl-ley">\n{ley}\n</div>\n{pops}\n'
    )
    with open(SALIDA, 'w') as f:
        f.write(doc)
    ins_n = doc.count('<ins>')
    print(f'OK → {SALIDA}')
    print(f'  <ins>: {ins_n} · obleas: {doc.count("pl-oblea ")} · '
          f'popups: {doc.count(chr(34) + "pl-pop" + chr(34))} · '
          f'charts: {doc.count("pl-chart")}')

if __name__ == '__main__':
    main()
