"""Bounded PDF text extraction in a disposable subprocess (no OCR)."""

import io
import json
import sys


def extract(raw):
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(raw), strict=False)
    if reader.is_encrypted:
        raise ValueError("PDF protegido por senha. Exporte uma cópia sem senha.")
    if len(reader.pages) > 100:
        raise ValueError("Limite de 100 páginas por PDF.")
    rows = []
    size = 0
    for index, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        size += len(text)
        if size > 1000000:
            raise ValueError("O texto do PDF excede um milhão de caracteres.")
        for line in text.splitlines():
            if line.strip():
                rows.append({"Página": index + 1, "Texto": line.strip()})
                if len(rows) > 50000:
                    raise ValueError("O PDF excede 50.000 linhas de texto.")
    return {"rows": rows, "pages": len(reader.pages)}


if __name__ == "__main__":
    try:
        import resource

        resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
        print(
            json.dumps(
                extract(sys.stdin.buffer.read(11 * 1024 * 1024)), ensure_ascii=False
            )
        )
    except Exception as error:
        message = (
            str(error)
            if isinstance(error, ValueError)
            else "Não foi possível extrair este PDF. Confira o arquivo."
        )
        print(json.dumps({"error": message}))
