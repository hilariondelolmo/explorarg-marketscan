import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Descarga con registro de email (gate real, opción B de HDO 2026-08-17).
 *
 * POST { email, doc } → valida el email, lo registra y devuelve el archivo.
 * Los archivos viven en /descargas (fuera de public/): sin pasar por acá
 * no hay URL directa que los exponga.
 *
 * Registro: si REGISTRO_FORM_URL y REGISTRO_FORM_CAMPO están configuradas
 * (un Google Form con un campo de email → las respuestas caen en la
 * planilla privada de HDO), cada descarga se envía ahí. Siempre queda
 * además en los logs de la función.
 */

const DOCS = {
  // La descarga del sitio entrega SIEMPRE los dos documentos juntos
  // (decisión HDO 2026-08-17). El zip se regenera a mano si cambian los
  // archivos fuente (ver memoria del proyecto).
  ambos: {
    archivo: 'documentos-s0809-2026.zip',
    nombre: 'Documentos Propuesta S-0809-2026.zip',
    mime: 'application/zip',
  },
  'ambos-optimizada': {
    archivo: 'documentos-s0809-2026-optimizada.zip',
    nombre: 'Documentos Propuesta optimizada S-0809-2026.zip',
    mime: 'application/zip',
  },
  propuesta: {
    archivo: 'propuesta-ley-s0809-2026-modificaciones.docx',
    nombre: 'Propuesta de ley S-0809-2026 con modificaciones.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  fundamentos: {
    archivo: 'fundamentos-respaldo-datos-s0809-2026.pdf',
    nombre: 'Fundamentos y respaldo en datos S-0809-2026.pdf',
    mime: 'application/pdf',
  },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function registrar(email, doc, req) {
  const cuando = new Date().toISOString();
  console.log(`[descarga] ${cuando} ${email} → ${doc}`);
  const url = process.env.REGISTRO_FORM_URL;
  const campo = process.env.REGISTRO_FORM_CAMPO;
  if (!url || !campo) return;
  try {
    const cuerpo = new URLSearchParams({ [campo]: email });
    const campoDoc = process.env.REGISTRO_FORM_CAMPO_DOC;
    if (campoDoc) cuerpo.set(campoDoc, doc);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo.toString(),
    });
  } catch (e) {
    // el registro nunca debe frenar la descarga; queda el log
    console.error('[descarga] registro falló:', e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  const { email, doc, apellido } = req.body ?? {};
  // honeypot: el form visible nunca completa "apellido"
  if (apellido) {
    res.status(400).json({ error: 'Solicitud inválida' });
    return;
  }
  if (typeof email !== 'string' || email.length > 120 || !EMAIL_RE.test(email.trim())) {
    res.status(400).json({ error: 'Ingresá una dirección de email válida' });
    return;
  }
  const info = DOCS[doc];
  if (!info) {
    res.status(400).json({ error: 'Documento desconocido' });
    return;
  }

  await registrar(email.trim().toLowerCase(), doc, req);

  const ruta = path.join(process.cwd(), 'descargas', info.archivo);
  const contenido = await readFile(ruta);
  res.setHeader('Content-Type', info.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${info.nombre}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(contenido);
}
