#!/usr/bin/env python3
"""Genera src/content/propuesta-optimizada.html desde el docx rev0 de HDO.

Propuesta optimizada (27/08): versión breve para la discusión del dictamen,
control de cambios sobre el texto base SE_260729 del Proyecto S-0809/2026.
Mismo criterio visual que la página de la propuesta completa: texto final =
orig + ins (los del se descartan), inserciones como <ins> rojo subrayado.
Sin obleas ni popups: esta versión no tiene informe punto a punto.

Reutiliza el parseo/render de scripts/generar_propuesta_html.py.
"""
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from generar_propuesta_html import (  # noqa: E402
    extraer, fusionar_encabezados, render_p, render_runs, render_tabla,
    texto_final,
)

CARPETA = ('/Users/hilariondelolmo/Desktop/01. Notas, articulos/Ley Ejecutivo/'
           'Finales/Propuestas Secretaria de Energia/Ultima Version/')
DOCX = CARPETA + '2026.09.01 Propuesta ley S80926PL SE_260729 cc HDO rev2.docx'
SALIDA = str(Path(__file__).parent.parent / 'src/content/propuesta-optimizada.html')
BLOB_COMPLETA = str(Path(__file__).parent.parent / 'src/content/propuesta-s80926pl.html')

# La numeración de la propuesta optimizada es la del texto base SE_260729
# (44 artículos); la propuesta completa (y su informe) usan la numeración
# del cc del 11/08, que insertaba dos artículos nuevos (15 Registro y
# 20 Integradas) y corría el resto. Mapeo: artículo optimizada -> artículo
# del informe cuyo popup le corresponde. Los cc 15 y 20 quedaron fusionados
# dentro de los arts. 14 y 39 y no tienen oblea propia.
ART_A_INFORME = {
    3: 3, 5: 5, 6: 6, 10: 10, 12: 12, 13: 13, 14: 14,
    15: 16,   # Mercado a término
    16: 17,   # Precios de referencia de paridad
    18: 19,   # Co-procesamiento
    24: 26,   # Importaciones
    31: 33,   # Infracciones
    34: 36,   # Exención tributaria
    36: 38,   # Definiciones del Período de Transición
    37: 39,   # Funciones durante la transición y prórroga
    38: 40,   # Tabla de cupos
    39: 41,   # Pautas
    40: 42,   # Derogación
}


# ── Overrides de popups para la optimizada ─────────────────────────────
# El informe (y sus popups) fue escrito para la propuesta completa; donde
# la optimizada (rev1 del 27/08) cambió el mecanismo, el texto de Normas/
# Justificación se reemplaza acá. Los "hechos" se conservan salvo los dos
# que describían el esquema viejo (37 y 38). Clave: (art_base, tipo).
POPUP_OVERRIDES = {
    (12, 'normas'): (
        '<p>El texto base presentaba dos problemas. Primero, otorgaba a la '
        'Autoridad la facultad de modificar el porcentaje obligatorio por '
        'causales abiertas, sin plazo ni piso, reproduciendo una delegación '
        'sin bases suficientes reñida con el artículo 76 de la Constitución: '
        'la técnica exacta con la que se vació el mandato durante dieciséis '
        'años. Segundo, exigía calidad, pero no desempeño ambiental al '
        'biodiesel computable, aunque el artículo 2° funda el interés '
        'público en la transición hacia energías más limpias; el régimen '
        'podía reconocer por igual volúmenes con reducciones de emisiones '
        'materialmente distintas. Tercero, la excepción al corte para la '
        'generación eléctrica comprendía en forma genérica a las centrales, '
        'lo que permitía eludir el mandato con motores diésel comunes.</p>'),
    (12, 'just'): (
        '<p>Se fija un piso físico: el porcentaje que cada mezclador debe '
        'incorporar es igual al obligatorio, con una única deducción '
        'admitida -el crédito adicional generado por el biodiesel de '
        'segunda generación adjudicado, efectivamente entregado y '
        'certificado conforme el artículo 14- dentro del cómputo máximo del '
        'artículo 38. Ningún crédito nominal puede reducir la incorporación '
        'física sin que exista el volumen certificado que le da origen.</p>'
        '<p>Se incorpora un umbral general del sesenta por ciento de '
        'reducción certificada de emisiones para el biodiesel computable, '
        'que junto con el noventa por ciento exigido a la segunda '
        'generación establece pisos ambientales verificables.</p>'
        '<p>La facultad de reducción deja de ser abierta: solo procede ante '
        'imposibilidad técnica o insuficiencia física de abastecimiento '
        'acreditada, mediante acto fundado, por seis meses renovables una '
        'única vez y sin afectar el porcentaje del Segmento Competitivo '
        'Empresas No Integradas; cesada la causa o vencido el plazo, el '
        'porcentaje se restablece de pleno derecho.</p>'
        '<p>La excepción para la generación de energía eléctrica queda '
        'limitada a turbinas: no alcanza al gasoil destinado a motores '
        'alternativos de combustión interna, incluidos los de encendido '
        'por compresión usados para generar electricidad.</p>'),
    (14, 'normas'): (
        '<p>El texto base describía el mecanismo como ofertas que las '
        'partes negociaban hasta arribar a un acuerdo mutuo. En un mercado '
        'comprador concentrado, la exigencia de acuerdo consagraba el poder '
        'de veto del mezclador: podía declarar demanda, rechazar todas las '
        'ofertas y frustrar el cumplimiento sin consecuencia. El sistema '
        'anunciado como subasta carecía de orden de mérito, precio de '
        'cierre, demanda vinculante, obligación de retiro y garantías '
        'simétricas. También omitía todo reconocimiento del biodiesel de '
        'segunda generación y delegaba en la Autoridad la elección de la '
        'modalidad de negociación, con aptitud para reintroducir precios o '
        'criterios administrativos sin base legislativa. Esas omisiones '
        'comprometían los artículos 14, 17, 42 y 76 de la Constitución y '
        'los artículos 1° y 3° de la Ley 27.442.</p>'),
    (14, 'just'): (
        '<p>La adjudicación se transforma en el resultado automático de una '
        'subasta: las ofertas se ordenan por precio hasta cubrir la demanda '
        'del segmento, la última adjudicada determina un precio único de '
        'cierre y la demanda declarada es vinculante. La adjudicación '
        'genera obligaciones simétricas de entrega o pago y de retiro o '
        'pago, con las garantías que fije la reglamentación. Las subastas '
        'son específicas e independientes para el biodiesel y el bioetanol; '
        'dentro de la subasta única de biodiesel se distinguen el Segmento '
        'Competitivo Empresas No Integradas y el Segmento Competitivo '
        'Remanente, respetando la proporción del artículo 38, y en la de '
        'bioetanol, la distinción por materia prima del artículo 13.</p>'
        '<p>El biodiesel de segunda generación recibe un reconocimiento '
        'cerrado en la propia ley: el volumen adjudicado, efectivamente '
        'entregado y certificado computa por dos dentro del cómputo máximo '
        'del artículo 38, y su precio de liquidación -el doble del '
        'ofertado- no puede superar una coma cinco veces el precio de '
        'cierre del Segmento Competitivo Empresas No Integradas. Ni el cupo '
        'ni el tope de precio quedan librados a la reglamentación.</p>'
        '<p>El Mercado Electrónico debe llevar un registro público y '
        'trazable de las operaciones y publicar en forma analítica los '
        'resultados de cada ronda. En un mercado obligatorio creado por '
        'ley, la publicación es la infraestructura de control que permite '
        'medir cumplimiento y concentración; el detalle de los campos se '
        'delega en la reglamentación, no así la obligación de publicar.</p>'),
    (15, 'just'): (
        '<p>El contrato a término se mantiene como instrumento de '
        'previsibilidad, pero solo puede celebrarse y registrarse a través '
        'del Mercado Electrónico, en ocasión de cada subasta y conforme la '
        'reglamentación. Durante el Período de Transición no puede recaer '
        'sobre los volúmenes del Segmento Competitivo Empresas No '
        'Integradas, de modo que no erosiona el segmento protegido.</p>'
        '<p>El plazo máximo es de seis meses y toda renovación o prórroga '
        'exige una nueva Solicitud de Ofertas a Término. Los volúmenes '
        'vuelven así periódicamente a concurso: ninguna relación bilateral '
        'puede cerrar el mercado por períodos prolongados ni bloquear el '
        'ingreso de terceros. Las operaciones deben informarse a la '
        'Autoridad de Aplicación con la periodicidad que esta determine.</p>'),
    (16, 'just'): (
        '<p>Las paridades de importación de biodiesel y bioetanol se '
        'declaran de carácter exclusivamente informativo y de referencia: '
        'ninguna puede convertirse en precio máximo, mínimo ni condición de '
        'adjudicación, porque el precio del mandato se forma en la subasta '
        'del artículo 14. Se incorporan además la paridad de exportación '
        'del metanol -insumo concentrado en un único proveedor- y la '
        'publicación de los volúmenes consumidos y precios del combustible '
        'coprocesado y de su componente biogénico certificado, de modo que '
        'las magnitudes que el régimen reconoce sean públicas y '
        'verificables.</p>'),
    (18, 'just'): (
        '<p>El coprocesamiento pasa a ser una categoría propia y optativa, '
        'separada del corte obligatorio. Los refinadores pueden incorporar '
        'el componente biogénico certificado definido en el artículo 6° '
        '-medido por balance de masa, trazabilidad y certificación '
        'internacional, con una reducción certificada de emisiones igual o '
        'superior al cincuenta y cinco por ciento- hasta un máximo del '
        'cinco por ciento del producto final comercializado.</p>'
        '<p>El combustible coprocesado no es biodiesel, no computa a los '
        'fines del cumplimiento de la mezcla obligatoria y no puede '
        'sustituir ni reducir los volúmenes previstos en el artículo 38. En '
        'ningún caso puede computarse la materia prima ingresada al '
        'proceso. El reconocimiento fiscal del artículo 34 y la publicación '
        'de volúmenes y precios del artículo 16 recaen exclusivamente sobre '
        'la magnitud certificada: se promueve la incorporación real de '
        'componente renovable sin permitir que una magnitud no verificable '
        'satisfaga el mandato ni desplace al producto certificado.</p>'),
    (24, 'just'): (
        '<p>La comparación se limita a bienes equivalentes: igual calidad, '
        'condición de entrega, tratamiento tributario y demás condiciones '
        'comerciales objetivamente verificables, conforme la metodología '
        'que fije la reglamentación. La importación conserva su función de '
        'disciplina competitiva y de respuesta ante escasez, pero el acto '
        'que la autorice debe fundarse en una comparación practicable: '
        'deja de depender de un cotejo entre bienes heterogéneos, '
        'metodológicamente arbitrario, que habilitaba una apertura '
        'discrecional capaz de vaciar el mandato.</p>'),
    (34, 'just'): (
        '<p>La exención queda limitada a la cantidad correspondiente al '
        'componente biogénico certificado conforme los artículos 6° y 18. '
        'La base del beneficio pasa a ser una magnitud física y energética '
        'medida, trazable y certificada. Que el coprocesado no compute '
        'contra el corte no altera su tratamiento fiscal: la existencia '
        'real de contenido renovable y su reconocimiento tributario '
        'dependen de la certificación, no del destino regulatorio del '
        'volumen.</p>'),
    (36, 'normas'): (
        '<p>El texto base circunscribía a la transición las definiciones de '
        'empresas integradas, no integradas y grupo económico, aunque esas '
        'categorías deben producir efectos durante toda la vigencia de la '
        'ley, y definía el cómputo máximo únicamente en relación con el '
        'coprocesamiento, sin regla para el crédito de segunda generación '
        'ni para el volumen mínimo que debe abastecerse con biodiesel '
        'físico. Sin esas definiciones, la tabla del artículo 38 podía ser '
        'interpretada de manera distinta por cada sujeto obligado y no '
        'ofrecía base cierta para fiscalizar o sancionar.</p>'),
    (36, 'just'): (
        '<p>Las definiciones pasan a regir a los efectos de toda la ley, '
        'con lo que las obligaciones permanentes dirigidas a esos sujetos '
        'conservan destinatario legal determinable después de la '
        'transición. El cómputo máximo queda referido al crédito adicional '
        'del biodiesel de segunda generación previsto en el artículo 14, y '
        'se define el cómputo mínimo: el porcentaje del corte que debe '
        'abastecerse con biodiesel adquirido al Segmento Competitivo '
        'Empresas No Integradas conforme el artículo 38, que se incrementa '
        'automáticamente cuando los cómputos máximos no son utilizados. La '
        'relación entre crédito y volumen físico queda fijada antes de la '
        'tabla, cumpliendo la exigencia de determinación de los artículos '
        '18 y 19 de la Constitución.</p>'),
    (37, 'just'): (
        '<p>Seis meses antes del vencimiento, la Autoridad debe elaborar y '
        'publicar un informe de evaluación del mercado y remitirlo al '
        'Congreso. La prórroga deja de ser una facultad: opera de pleno '
        'derecho, por única vez y por treinta y seis meses, cuando el '
        'informe verifica al menos dos de cuatro indicadores; opera también '
        'si el informe no se publica en plazo. Durante la extensión '
        'continúan los porcentajes, límites y resguardos del último año, de '
        'modo que ni la acción ni la inacción administrativa pueden alterar '
        'el resultado que la ley define.</p>'
        '<p>Los indicadores miden estructura, no conducta: menos de ocho '
        'elaboradoras no integradas independientes con adjudicaciones '
        'efectivas en los doce meses previos; un mezclador o grupo '
        'económico con más del cincuenta por ciento de las compras del '
        'mandato; un precio del aceite crudo de soja efectivamente pagado '
        'por las Empresas No Integradas superior al Valor FAS Teórico '
        'oficial -comparado sobre bases equivalentes- en al menos cuatro de '
        'los doce meses previos; y la falta de acceso efectivo de las '
        'Empresas No Integradas al régimen de exportación a la Unión '
        'Europea de la Decisión de Ejecución (UE) 2019/245, en los términos '
        'del artículo 5°. La reglamentación establece la metodología de '
        'verificación, sin poder alterar los indicadores. El FAS funciona '
        'como test de mercado y no como precio máximo; el indicador externo '
        'distingue acceso de resultado y se coordina con el deber de '
        'gestión del artículo 5°.</p>'),
    (37, 'hechos'): (
        '<div class="pl-kpis">'
        '<div class="pl-kpi"><span class="pl-kpi-valor">2 de 4</span>'
        '<span class="pl-kpi-label">indicadores de prórroga se verificarían '
        'hoy: el número exacto que la dispara</span></div>'
        '<div class="pl-kpi pl-kpi-neg"><span class="pl-kpi-valor">≈60%</span>'
        '<span class="pl-kpi-label">de las compras en un solo comprador (el '
        'indicador fija 50%)</span></div>'
        '<div class="pl-kpi pl-kpi-neg"><span class="pl-kpi-valor">Sin acceso</span>'
        '<span class="pl-kpi-label">de las No Integradas al cupo europeo '
        '(Decisión UE 2019/245)</span></div>'
        '</div>'
        '<p>La ineficacia de una evaluación sin consecuencia jurídica está '
        'probada por el antecedente directo: la Ley 27.640 ordenó '
        'garantizar una rentabilidad determinada y la Autoridad tardó más '
        'de tres años en dictar la metodología, para luego incumplirla '
        'durante dieciséis meses consecutivos, sin que ningún mecanismo '
        'legal revirtiera la demora ni el apartamiento.</p>'
        '<p>Los indicadores no describen un escenario hipotético: medidos '
        'con los datos disponibles, dos de los cuatro se verificarían hoy '
        '-exactamente el número que la ley exige para la prórroga '
        'automática-. Un solo comprador concentra cerca del 60% de las '
        'compras, por encima del 50% que fija el segundo indicador, y las '
        'Empresas No Integradas carecen de todo mecanismo de acceso a las '
        'exportaciones a la Unión Europea bajo la Decisión de Ejecución '
        '(UE) 2019/245, que hoy canaliza en exclusividad a las integradas: '
        'el cuarto indicador. La prórroga automática no protege contra un '
        'riesgo eventual: reconoce una persistencia estructural que los '
        'datos actuales ya exhiben.</p>'),
    (38, 'just'): (
        '<p>La tabla separa el Segmento Competitivo Empresas No Integradas '
        'del Segmento Competitivo Remanente y, dentro de este último, '
        'distingue el crédito adicional generado por el biodiesel de '
        'segunda generación -que se origina en adjudicaciones del segmento '
        'de las no integradas y se imputa al remanente- del biodiesel '
        'físico de primera generación. Cada columna suma el corte '
        'obligatorio total y una fila final muestra el corte resultante en '
        'volumen físico. La rotulación identifica el origen y el canal de '
        'cada cómputo, evita presentar un crédito como producto y permite '
        'verificar la correspondencia entre los artículos 12, 14, 36 y 39. '
        'El coprocesamiento queda fuera de la tabla: como categoría propia '
        'del artículo 18, no integra el corte ni consume cupo de ningún '
        'segmento.</p>'),
    (38, 'hechos'): (
        '<div class="pl-kpis">'
        '<div class="pl-kpi pl-kpi-neg"><span class="pl-kpi-valor">2,6 Mt</span>'
        '<span class="pl-kpi-label">de déficit sin sanción bajo la '
        'obligación agregada del régimen vigente</span></div>'
        '<div class="pl-kpi"><span class="pl-kpi-valor">2</span>'
        '<span class="pl-kpi-label">conceptos que la tabla separa: volumen '
        'físico y crédito regulatorio</span></div>'
        '</div>'
        '<p>La agregación de conceptos heterogéneos en una obligación única '
        'ya produjo su efecto: durante la vigencia del régimen actual, la '
        'imposibilidad de distinguir con certeza qué se debía, quién lo '
        'debía y cómo se verificaba acompañó un déficit de mezcla de 2,6 '
        'millones de toneladas sin sanción. Una tabla que rotula por '
        'separado el volumen físico y el crédito no es un refinamiento '
        'formal: es la condición para que el incumplimiento deje de ser '
        'indetectable por diseño.</p>'),
    (39, 'just'): (
        '<p>Los límites del catorce por ciento por empresa y por grupo '
        'económico se extienden a la totalidad del biodiesel físico '
        'destinado al mandato, cualquiera sea el segmento o la modalidad '
        'contractual, y la adjudicación por empresa no puede exceder su '
        'capacidad instalada registrada. El inciso que permitía computar en '
        'la transición el elemento no fósil coprocesado se elimina: el '
        'coprocesamiento se rige exclusivamente por el artículo 18, fuera '
        'del corte.</p>'
        '<p>El volumen faltante deja de ser negociable por fuera del '
        'sistema: finalizado el período de abastecimiento, se suma al '
        'volumen de la subasta inmediata posterior. Ninguna vía bilateral '
        'puede eludir publicidad, límites ni control de concentración.</p>'
        '<p>Se incorporan, además, las obligaciones de conducta de las '
        'empresas integradas que produzcan o comercialicen materias primas: '
        'condiciones objetivas, transparentes y no discriminatorias de '
        'oferta y comercialización respecto de las Empresas No Integradas, '
        'con precios libremente pactados y aplicación complementaria de la '
        'Ley N° 27.442. La regla gobierna el comportamiento y no el valor '
        'de la transacción.</p>'),
}

# Retoques menores sobre popups que se conservan: referencias a la
# numeración del informe que deben decir la de la optimizada.
POPUP_REEMPLAZOS = {
    (3, 'just'): [
        ('el coprocesamiento del artículo 19 y el sistema de fiscalización '
         'y sanciones de los artículos 28 y 33',
         'el coprocesamiento del artículo 18 y el régimen de infracciones '
         'del artículo 31'),
    ],
    (5, 'just'): [
        ('Se agrega, además, la facultad de establecer, verificar y '
         'fiscalizar certificación de sustentabilidad, trazabilidad física '
         'y documental, balance de masa, balance de carbono, rendimiento de '
         'proceso y análisis isotópico de carbono 14.',
         'Se agrega, además, la facultad de reconocer y fiscalizar los '
         'esquemas de certificación de sustentabilidad y de reducción de '
         'emisiones aplicables a los fines de la ley.'),
    ],
    (6, 'just'): [
        ('Las categorías estructurales se incorporan al régimen general con '
         'vigencia durante todo el plazo de la ley.',
         'Las categorías estructurales adquieren vigencia general: las '
         'definiciones de empresas integradas, no integradas y grupo '
         'económico del artículo 36 pasan a regir a los efectos de toda la '
         'ley.'),
    ],
}


def aplicar_overrides(pop, base, tipo):
    """Reemplaza el cuerpo del popup (si hay override) conservando el div
    contenedor con sus data-*, o aplica los retoques de referencias."""
    if (base, tipo) in POPUP_OVERRIDES:
        m = re.match(r'<div class="pl-pop"[^>]*>', pop)
        return m.group(0) + POPUP_OVERRIDES[(base, tipo)] + '</div>'
    for viejo, nuevo in POPUP_REEMPLAZOS.get((base, tipo), []):
        if viejo not in pop:
            raise SystemExit(f'retoque no hallado en popup {base}/{tipo}: {viejo[:50]}')
        pop = pop.replace(viejo, nuevo)
    return pop



# ── Cuadro de correspondencia "versión senador" (decisión HDO 01/09) ───
# Reemplaza en el popup a la tabla original del informe. Es el mismo
# contenido del Word "2026.09.01 Cuadro Correspondencia Propuesta
# Optimizada" (validado idéntico): qué establece el oficial, qué se
# propone y para qué. Cada fila salta a su artículo (data-art).
CUADRO_SENADOR = [
    (3, '3°', 'Objetivos',
     'Los objetivos de la política nacional no contienen ninguna pauta para valorar el desempeño ambiental de los biocombustibles.',
     'Se agrega como objetivo expreso el desarrollo de los biocombustibles de segunda generación y la reducción certificada de emisiones.',
     'La transición hacia energías más limpias que el proyecto declara pasa a ser una pauta operativa, no una frase.'),
    (5, '5°', 'Exportaciones',
     'Ordena promover las exportaciones de manera genérica, sin ninguna medida concreta.',
     'La Autoridad deberá gestionar, junto a Cancillería, que las elaboradoras no integradas accedan al régimen de exportación a la Unión Europea (Decisión UE 2019/245), hoy reservado de hecho a las grandes integradas. Se agrega la facultad de reconocer y fiscalizar las certificaciones.',
     'Corrige una exclusión de origen estatal: quienes nunca pudieron exportar son hoy los únicos fuera del canal europeo.'),
    (6, '6°', 'Definiciones',
     'No define el biodiesel de segunda generación ni el componente renovable del coprocesamiento, aunque el régimen les asigna efectos económicos y fiscales.',
     'Se definen ambos con umbrales verificables (90% de reducción certificada para la segunda generación) y se establece que solo computa lo medido y certificado.',
     'Todo beneficio del régimen recae sobre magnitudes que se pueden medir y auditar.'),
    (10, '10', 'Registro',
     'El silencio administrativo positivo a los 10 días permitiría iniciar actividades industriales sin verificación técnica ni de seguridad.',
     'El silencio positivo queda limitado a la inscripción registral.',
     'Registro ágil sin habilitar la operación de instalaciones no verificadas.'),
    (12, '12', 'Corte de gasoil',
     'La Autoridad puede modificar el porcentaje obligatorio por causales abiertas, sin plazo ni piso: la misma facultad con la que el corte se cumplió solo 3 de los últimos 16 años.',
     'Solo puede aumentarlo. La reducción exige causa técnica acreditada, dura como máximo 6 meses renovables una vez y el porcentaje se restablece automáticamente. Se agrega un piso físico de incorporación y un umbral ambiental del 60% de reducción certificada.',
     'Cierra el mecanismo documentado con el que se vació el mandato durante dieciséis años.'),
    (13, '13', 'Corte de naftas',
     'La misma facultad abierta de reducción, que además contradice los mínimos de 6% caña y 6% maíz que el propio artículo fija.',
     'Igual regla que el 12: solo aumentar; reducir con causa, plazo y restablecimiento automático, respetando los mínimos por materia prima.',
     'La facultad queda compatible con la estructura de la propia ley.'),
    (14, '14', 'Mecanismo de comercialización',
     'Las partes negocian "hasta arribar a un acuerdo mutuo": frente a una demanda donde 4 compañías concentran el 98% de las compras, eso consagra el poder de veto del comprador.',
     'Subasta con adjudicación por orden de mérito, precio único de cierre, demanda declarada vinculante y obligaciones de entrega y de retiro. El biodiesel de segunda generación computa doble, con cupo y tope de precio (1,5 veces el cierre) fijados en la ley.',
     'Elimina el veto del comprador dominante sin volver al precio administrado que ya fracasó: diez resoluciones fuera de la ley y dieciséis meses de precios bajo la propia fórmula.'),
    (14, '14', 'Transparencia',
     'Solo exige un registro interno de los contratos resultantes.',
     'Registro público y trazable de las operaciones y publicación analítica de los resultados de cada ronda.',
     'Un mercado obligatorio creado por ley debe poder controlarse desde afuera.'),
    (15, '15', 'Contratos a término',
     'Contratos bilaterales libres, sin procedimiento, publicidad ni duración máxima.',
     'Solo a través del Mercado Electrónico, con plazo máximo de 6 meses y nueva solicitud abierta para renovar; durante la transición no pueden tocar el segmento de las no integradas.',
     'La previsibilidad contractual no puede usarse para cerrar el mercado por fuera de la concurrencia.'),
    (16, '16', 'Precios de referencia',
     'Publica paridades de importación sin definir su función: podrían convertirse por vía reglamentaria en precios administrados.',
     'Las paridades son exclusivamente informativas. Se agregan la paridad del metanol (insumo concentrado en un único proveedor) y la publicación de volúmenes y precios del coprocesado.',
     'Referencias que informan y transparentan, sin reinstalar el precio administrado.'),
    (18, '18', 'Coprocesamiento',
     'El refinador puede computar contra el corte la materia prima ingresada al proceso: una magnitud que nadie mide ni certifica, hasta el 3%.',
     'Pasa a ser una categoría aparte y optativa, con tope del 5%: computa únicamente el componente biogénico certificado (reducción mínima del 55%), no es biodiesel, no satisface el corte ni desplaza los volúmenes de la tabla.',
     'Solo cuenta lo medido y certificado; el actor dominante no cumple el mandato con magnitudes inverificables.'),
    (24, '24', 'Importaciones',
     'Autoriza importar comparando bienes heterogéneos (producto terminado contra materia prima), sin igualdad de condiciones.',
     'La comparación debe hacerse sobre bases equivalentes: calidad, entrega, tratamiento tributario y demás condiciones verificables.',
     'Evita una apertura discrecional fundada en una comparación que no puede practicarse.'),
    (31, '31', 'Infracciones',
     'El régimen sancionatorio no tipifica las conductas propias del nuevo sistema de subastas, créditos y certificaciones.',
     'Se tipifican: certificación falsa, doble cómputo, demanda ficticia, incumplimiento de entrega o retiro, manipulación de ofertas y adulteración de trazabilidad.',
     'Incumplir deja de ser gratis: bajo el régimen vigente no consta sanción alguna pese al déficit acumulado.'),
    (34, '34', 'Exención tributaria',
     'Exime de ICL e ICO2 a la porción coprocesada sin exigir su medición: el beneficio recae sobre una cantidad que nadie determina.',
     'La exención queda limitada a la cantidad del componente biogénico certificado.',
     'El beneficio fiscal se paga sobre una base verificable, igual que el biodiesel con el que compite.'),
    (36, '36', 'Definiciones de la transición',
     'Las definiciones de empresa integrada, no integrada y grupo económico rigen solo durante la transición, aunque hay obligaciones permanentes dirigidas a esos sujetos.',
     'Pasan a regir para toda la ley. Se definen además el cómputo máximo (crédito de segunda generación) y el cómputo mínimo que debe abastecerse con biodiesel físico.',
     'Las obligaciones permanentes conservan sujeto y magnitud determinables después de 2031.'),
    (37, '37', 'Prórroga de la transición',
     'Ordena evaluar el mercado, pero la evaluación no produce ninguna consecuencia: los resguardos caen por calendario aunque persista la concentración.',
     'Informe público al Congreso 6 meses antes del vencimiento. La transición se prorroga automáticamente por 36 meses si se verifican 2 de 4 indicadores objetivos (cantidad de oferentes, concentración de compras, acceso al aceite a valores FAS, acceso al cupo europeo); también si el informe no se publica.',
     'La salida de la transición depende de datos verificables, no de la discrecionalidad del funcionario de turno. Dos de los cuatro indicadores se verificarían hoy.'),
    (38, '38', 'Tabla de cupos',
     'La tabla agrupa en una misma obligación conceptos heterogéneos: no permite distinguir qué parte del 10% es producto físico y qué parte es cómputo.',
     'La tabla separa el segmento de las no integradas, el crédito de segunda generación y el biodiesel físico, y muestra el corte resultante en volumen real año por año.',
     'Una obligación que se puede verificar y fiscalizar: el incumplimiento deja de ser indetectable por diseño.'),
    (39, '39', 'Límites de concentración',
     'El límite del 14% por empresa rige solo dentro del segmento de las no integradas; el volumen faltante puede negociarse libremente por fuera del sistema.',
     'Los límites del 14% por empresa y por grupo económico se aplican a todo el biodiesel físico del mandato, en cualquier segmento o modalidad. El faltante se suma a la subasta del período siguiente.',
     'Sin vías laterales para reconcentrar el mercado ni para eludir la subasta: bajo el régimen vigente el faltante fue la regla, no la excepción.'),
    (39, '39', 'Acceso a la materia prima',
     'No contiene ninguna regla sobre el acceso al aceite, el insumo que explica más de tres cuartas partes del costo y que venden los grupos que compiten aguas abajo.',
     'Las integradas que produzcan o comercialicen materias primas deben garantizar condiciones objetivas y no discriminatorias, con precios libremente pactados, en aplicación complementaria de la Ley 27.442.',
     'Protege el acceso al insumo esencial gobernando conductas, no precios.'),
    (40, '40', 'Derogación de la Ley 27.640',
     'Deroga la Ley 27.640 al día siguiente de la publicación, aunque el sistema que la reemplaza (mercado, registros, garantías, certificación) todavía no existe.',
     'La derogación difiere sus efectos hasta que la Autoridad declare operativos los mecanismos de la nueva ley, con un máximo de 12 meses; los actos del régimen anterior conservan validez hasta su reemplazo.',
     'Sucesión ordenada entre regímenes, sin vacío de abastecimiento.'),
]


def tabla_cuadro_senador():
    out = ['<div class="pl-tabla-scroll"><table class="pl-cuadro">',
           '<tr><th><p>Artículo</p></th>'
           '<th><p>Qué establece el proyecto oficial</p></th>'
           '<th><p>Qué se propone</p></th>'
           '<th><p>Para qué</p></th></tr>']
    for nro, rot, tema, ofi, prop, para in CUADRO_SENADOR:
        out.append(
            f'<tr class="pl-cuadro-fila" data-art="{nro}">'
            f'<td><p>{rot}</p><p class="pl-cuadro-tema">{tema}</p></td>'
            f'<td><p>{ofi}</p></td>'
            f'<td><p><ins>{prop}</ins></p></td>'
            f'<td><p>{para}</p></td></tr>')
    out.append('</table></div>')
    return ''.join(out)


def reemplazar_tabla_cuadro(pop):
    i = pop.find('<div class="pl-tabla-scroll">')
    f = pop.find('</table>') + len('</table></div>')
    assert i > 0
    return pop[:i] + tabla_cuadro_senador() + pop[f:]


# Filas del cuadro de correspondencia: numeración del informe -> optimizada.
# cc15 (Registro) y cc20 (Integradas) quedaron fusionados dentro de los
# arts. 14 y 39: sus filas se remapean ahí (dos filas pueden compartir
# número). La fila cc28 (Fiscalización del sistema de créditos) se elimina:
# esa modificación no existe en la versión optimizada.
CC_A_BASE = {cc: base for base, cc in ART_A_INFORME.items()}
CC_A_BASE.update({15: 14, 20: 39})
CC_ELIMINADAS = {28}


def remapear_cuadro(pop):
    """Renumera las filas del cuadro (data-art y celda del número), quita
    las de modificaciones que no están en la optimizada y reordena por el
    número nuevo."""
    filas = list(re.finditer(r'<tr class="pl-cuadro-fila"[^>]*data-art="(\d+)">.*?</tr>',
                             pop, re.S))
    if not filas:
        return pop
    nuevas = []
    for orden, m in enumerate(filas):
        cc = int(m.group(1))
        if cc in CC_ELIMINADAS:
            continue
        base = CC_A_BASE[cc]
        fila = m.group(0)
        fila = fila.replace(f'data-art="{cc}"', f'data-art="{base}"', 1)
        rotulo = f'{base}°' if base < 10 else str(base)
        fila = re.sub(r'(<td><p>)\d+°?(</p></td>)', rf'\g<1>{rotulo}\g<2>', fila, count=1)
        nuevas.append((base, orden, fila))
    nuevas.sort()
    cuerpo = ''.join(f for _, _, f in nuevas)
    pop = pop[:filas[0].start()] + cuerpo + pop[filas[-1].end():]

    # segunda tabla del popup (síntesis por eje): su columna "Artículos"
    # lista números de la numeración del informe -> remapear igual
    def remapear_lista(m):
        nros = []
        for n in re.split(r'\s*,\s*', m.group(1)):
            cc = int(n)
            if cc in CC_ELIMINADAS:
                continue
            base = CC_A_BASE[cc]
            if base not in nros:
                nros.append(base)
        return '<td><p>' + ', '.join(str(n) for n in sorted(nros)) + '</p></td>'

    return re.sub(r'<td><p>(\d+(?:\s*,\s*\d+)+)</p></td>', remapear_lista, pop)


def extraer_popups_remapeados():
    """Extrae del blob de la propuesta completa los popups pl-pop de los
    artículos del informe y los re-etiqueta con la numeración optimizada
    (data-art y el número del data-titulo). El cuerpo de cada popup queda
    tal cual: puede citar números de la numeración del cc."""
    blob = open(BLOB_COMPLETA, encoding='utf-8').read()

    def bloque_div(desde):
        nivel = 0
        i = desde
        while True:
            m = re.search(r'<div\b|</div>', blob[i:])
            if not m:
                raise ValueError('div sin cierre')
            i += m.start()
            if blob[i:i + 4] == '<div':
                nivel += 1
                i += 4
            else:
                nivel -= 1
                i += len('</div>')
                if nivel == 0:
                    return blob[desde:i]

    popups = {}
    for m in re.finditer(r'<div class="pl-pop" data-art="(\d+)" data-tipo="(\w+)"', blob):
        popups[(int(m.group(1)), m.group(2))] = bloque_div(m.start())

    out = []
    for base, cc in ART_A_INFORME.items():
        for tipo in ('normas', 'just', 'hechos'):
            pop = popups.get((cc, tipo))
            if not pop:
                continue
            pop = pop.replace(f'data-art="{cc}"', f'data-art="{base}"', 1)
            pop = re.sub(r'(data-titulo="Artículo )(\d+)(°?)',
                         lambda m2: m2.group(1) + str(base) + ('°' if base < 10 else ''),
                         pop, count=1)
            pop = aplicar_overrides(pop, base, tipo)
            out.append(pop)

    # popups de introducción (Objeto y método / Marco normativo / Cuadro /
    # Criterio): el cuadro se renumera; los demás solo citan normas (CN,
    # leyes) o el art. 2°, que conserva su número
    for m in re.finditer(r'<div class="pl-pop" data-art="intro" data-tipo="(\w+)"', blob):
        tipo = m.group(1)
        if tipo not in ('objeto', 'marco', 'cuadro', 'cierre'):
            continue
        pop = bloque_div(m.start())
        if tipo == 'cuadro':
            pop = remapear_cuadro(pop)
            pop = reemplazar_tabla_cuadro(pop)
        if tipo == 'objeto':
            viejo = ('Este informe fundamenta las modificaciones introducidas al '
                     'proyecto de ley (versión SE 260729) en la revisión HDO del '
                     '11 de agosto de 2026, ordenadas por artículo.')
            nuevo = ('Este informe fundamenta las modificaciones introducidas al '
                     'proyecto de ley (versión SE 260729) en la propuesta '
                     'optimizada del 27 de agosto de 2026 -versión breve '
                     'elaborada para la discusión del dictamen: conserva las '
                     'modificaciones que la reglamentación no puede suplir y '
                     'delega expresamente lo operativo-, ordenadas por artículo.')
            if viejo not in pop:
                raise SystemExit('encabezado de Objeto y método no hallado')
            pop = pop.replace(viejo, nuevo)
        out.append(pop)
    return out


def generar(bloques):
    out = []
    abierta = None   # nro de artículo abierto

    def cerrar():
        nonlocal abierta
        if abierta is None:
            return
        if abierta in ART_A_INFORME:
            out.append(
                '<div class="pl-obleas">'
                f'<button type="button" class="pl-oblea pl-oblea-normas" data-art="{abierta}" data-tipo="normas">'
                'Normas que viola el proyecto oficial</button>'
                f'<button type="button" class="pl-oblea pl-oblea-just" data-art="{abierta}" data-tipo="just">'
                'Justificación de la modificación</button>'
                f'<button type="button" class="pl-oblea pl-oblea-hechos" data-art="{abierta}" data-tipo="hechos">'
                'Respaldo en datos</button>'
                '</div>')
        out.append('</section>')
        abierta = None

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
            abierta = nro
            clases = 'pl-art' + (' pl-art-informe' if nro in ART_A_INFORME else '')
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
        if abierta is None:
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


def main():
    ley = generar(fusionar_encabezados(extraer(DOCX)))
    popups = extraer_popups_remapeados()
    doc = (
        '<!-- Generado desde el docx rev1 de HDO (propuesta optimizada,\n'
        '     cc 27/08 sobre SE_260729). Los popups de las obleas provienen\n'
        '     del blob de la propuesta completa (numeración remapeada).\n'
        '     Script: scripts/generar_propuesta_optimizada.py — no editar a\n'
        '     mano los textos legales; regenerar desde el docx. -->\n'
        f'<div class="pl-ley">\n{ley}\n</div>\n'
        f'<div class="pl-popups" hidden>\n{chr(10).join(popups)}\n</div>\n'
    )
    with open(SALIDA, 'w') as f:
        f.write(doc)
    print(f'OK → {SALIDA}')
    print(f'  <ins>: {doc.count("<ins>")} · obleas: {doc.count("pl-oblea ")} · '
          f'popups: {len(popups)} · tablas: {doc.count("pl-tabla-scroll")} · '
          f'charts: {doc.count("pl-chart")}')


if __name__ == '__main__':
    main()
