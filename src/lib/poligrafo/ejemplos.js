// Polígrafo - enunciados de ejemplo ya traducidos a forma lógica.
//
// Sirven para dos cosas: mostrar la herramienta sin gastar una consulta a la
// IA, y como banco de prueba del motor (scripts/poligrafo_prueba.mjs).
// El `analisis` tiene la misma forma que devuelve el traductor con IA; lo
// escribió Claude a mano el 22/11/2026 siguiendo la consigna del traductor.

export const EJEMPLOS = [
  {
    id: 'nogoya',
    titulo: 'Las 25 elaboradoras no integradas y el 65% del corte',
    enunciado:
      'Lo importante acá es agrandar la torta. Hoy tenemos 25 elaboradoras no integradas de biodiésel, instaladas en Buenos Aires, La Pampa, Entre Ríos, San Luis y Santa Fe, muchas en pueblos donde nunca había habido una industria, como Nogoyá, en Entre Ríos. Hoy esas empresas abastecen alrededor del 65% del corte obligatorio.',
    analisis: {
      afirmaciones: [
        {
          id: 'A1',
          cita: 'Lo importante acá es agrandar la torta.',
          tipo: 'opinion',
          motivo: 'Dice qué habría que hacer: es un juicio de valor, no un hecho que se pueda medir.',
          indicador: 'ninguno', sujeto: '', criterio: 'ninguno', magnitud: 'ninguno', base: 'ninguno',
          medida: 'ninguno', periodo: '', periodo_inicial: '', comparador: 'ninguno', valor_numero: null, valor_lista: [],
        },
        {
          id: 'A2',
          cita: 'Hoy tenemos 25 elaboradoras no integradas de biodiésel',
          tipo: 'dato',
          motivo: '',
          indicador: 'cantidad_empresas', sujeto: 'categoria:NO INTEGRADA', criterio: 'ninguno', magnitud: 'ninguno',
          base: 'ninguno', medida: 'ninguno', periodo: '', periodo_inicial: '', comparador: 'igual', valor_numero: 25, valor_lista: [],
        },
        {
          id: 'A3',
          cita: 'instaladas en Buenos Aires, La Pampa, Entre Ríos, San Luis y Santa Fe',
          tipo: 'dato',
          motivo: '',
          indicador: 'provincias', sujeto: 'categoria:NO INTEGRADA', criterio: 'ninguno', magnitud: 'ninguno',
          base: 'ninguno', medida: 'ninguno', periodo: '', periodo_inicial: '', comparador: 'igual', valor_numero: null,
          valor_lista: ['PROVINCIA DE BUENOS AIRES', 'LA PAMPA', 'ENTRE RÍOS', 'SAN LUIS', 'SANTA FE'],
        },
        {
          id: 'A4',
          cita: 'muchas en pueblos donde nunca había habido una industria',
          tipo: 'sin_datos',
          motivo: 'El sitio no tiene la historia industrial de cada localidad.',
          indicador: 'ninguno', sujeto: '', criterio: 'ninguno', magnitud: 'ninguno', base: 'ninguno',
          medida: 'ninguno', periodo: '', periodo_inicial: '', comparador: 'ninguno', valor_numero: null, valor_lista: [],
        },
        {
          id: 'A5',
          cita: 'como Nogoyá, en Entre Ríos',
          tipo: 'dato',
          motivo: '',
          indicador: 'cantidad_empresas', sujeto: 'categoria:NO INTEGRADA+localidad:NOGOYÁ+provincia:ENTRE RÍOS',
          criterio: 'ninguno', magnitud: 'ninguno', base: 'ninguno', medida: 'ninguno', periodo: '', periodo_inicial: '',
          comparador: 'mayor_igual', valor_numero: 1, valor_lista: [],
        },
        {
          id: 'A6',
          cita: 'Hoy esas empresas abastecen alrededor del 65% del corte obligatorio',
          tipo: 'dato',
          motivo: '',
          indicador: 'participacion', sujeto: 'categoria:NO INTEGRADA', criterio: 'ninguno', magnitud: 'ventas_cupo',
          base: 'ninguno', medida: 'ninguno', periodo: '', periodo_inicial: '', comparador: 'aprox', valor_numero: 65, valor_lista: [],
        },
      ],
      preguntas: [
        {
          parametro: 'criterio',
          aplica_a: ['A2', 'A3', 'A5'],
          pregunta: '¿Qué empresas cuentan como elaboradoras que «hoy tenemos»?',
          opciones: ['ventas_cupo', 'produccion', 'cupo_asignado', 'con_planta'],
        },
        {
          parametro: 'periodo',
          aplica_a: ['A2', 'A3', 'A5', 'A6'],
          pregunta: '¿A qué período se refiere «hoy»?',
          opciones: ['ultimo_mes', 'ultimos_12_meses', 'anio:2026', 'anio:2025'],
        },
        {
          parametro: 'base',
          aplica_a: ['A6'],
          pregunta: '¿El 65% se mide sobre qué total?',
          opciones: ['total', 'corte_obligatorio'],
        },
      ],
      forma: 'A2 y A3 y A4 y A5 y A6',
    },
  },
  // Frase de HDO del 22/11/2026. La primera vez dio Indeterminado: los artículos 38 y 39 traen los
  // topes, pero la cuenta de si alcanzan no estaba en la ficha. Se conectó (D-TOPES-MS-*, topes39.js)
  // y quedó de ejemplo y de control: si esos datos dejan de estar, el banco de prueba lo avisa.
  // El análisis es el que devolvió el traductor con IA (Opus) ese día.
  {
    "id": "topes-media-sancion",
    "titulo": "La media sanción y el 7,5% de las no integradas",
    "enunciado": "Considerando la media sanción obtenida en senadores no es posible que el conjunto de empresas no integradas pueda abastecer el 7,5% de corte obligatorio.",
    "analisis": {
      "afirmaciones": [
        {
          "id": "A1",
          "cita": "Considerando la media sanción obtenida en senadores no es posible que el conjunto de empresas no integradas pueda abastecer el 7,5% de corte obligatorio.",
          "tipo": "norma",
          "motivo": "",
          "indicador": "ninguno",
          "sujeto": "",
          "criterio": "ninguno",
          "magnitud": "ninguno",
          "base": "ninguno",
          "medida": "ninguno",
          "producto": "ninguno",
          "producto_base": "ninguno",
          "equivalencia": "ninguno",
          "periodo": "",
          "periodo_inicial": "",
          "comparador": "ninguno",
          "valor_numero": null,
          "valor_lista": [],
          "norma_juicio": "respalda",
          "norma_explicacion": "La media sanción les reserva a las no integradas el 7,5% del gas oil durante el corte de 7,5% y limita a cada empresa al 10% del volumen con un máximo de 50.000 t y a cada grupo económico al 10%. Según la ficha, con esos topes las 24 no integradas que venden al corte pueden vender como máximo 730.988 t de las 919.294 t que se les reservan: faltan 188.306 t (20,5%), y lo más que pueden cubrir es el 5,96% del gas oil, aunque su capacidad instalada suma 1.327.200 t por año.",
          "citas": [
            {
              "id": "MS-38",
              "texto": "Empresas No Integradas (Corte por Sistema de comercialización Art. 14) | 7,5% | 6,5% | 5,5% | 5,0% | 4,0%"
            },
            {
              "id": "MS-39",
              "texto": "i) la participación por empresa elaboradora no excederá el diez por ciento (10%) del total de la cantidad de biodiesel comercializada por año calendario con un tope máximo de cincuenta mil (50.000) toneladas;"
            },
            {
              "id": "MS-39",
              "texto": "ii) la participación por grupo económico relacionado con la empresa elaboradora respectiva no excederá el diez por ciento (10%) del total de la cantidad de biodiesel comercializada por año calendario;"
            }
          ],
          "revision_tipo": "ninguna",
          "revision_omite": "",
          "revision_vale_para": "",
          "revision_no_vale_para": "",
          "revision_resultado": "ninguno",
          "revision_explicacion": "",
          "revision_citas": [],
          "revision_datos": [],
          "opinion_choca": "no",
          "opinion_hecho": "",
          "datos": [
            "D-TOPES-MS-PRIMER-ANIO",
            "D-TOPES-MS-MAXIMO"
          ]
        }
      ],
      "preguntas": [],
      "forma": "A1"
    }
  },
];
