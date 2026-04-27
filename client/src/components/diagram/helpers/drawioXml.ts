export type DrawioCell =
  | {
      kind: 'vertex';
      id: string;
      parent?: string;
      value: string;
      style: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      kind: 'edge';
      id: string;
      source: string;
      target: string;
      value: string;
      style: string;
    };

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cellXml(cell: DrawioCell): string {
  if (cell.kind === 'vertex') {
    const parent = cell.parent ?? '1';
    return (
      `<mxCell id="${xmlEscape(cell.id)}" value="${xmlEscape(cell.value)}" style="${xmlEscape(cell.style)}" vertex="1" parent="${xmlEscape(parent)}">` +
      `<mxGeometry x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" as="geometry"/>` +
      `</mxCell>`
    );
  }
  return (
    `<mxCell id="${xmlEscape(cell.id)}" value="${xmlEscape(cell.value)}" style="${xmlEscape(cell.style)}" edge="1" parent="1" source="${xmlEscape(cell.source)}" target="${xmlEscape(cell.target)}">` +
    `<mxGeometry relative="1" as="geometry"/>` +
    `</mxCell>`
  );
}

export function buildMxfile(cells: DrawioCell[], diagramName = 'Diagram'): string {
  const body = cells.map(cellXml).join('');
  return (
    `<mxfile host="app.diagrams.net">` +
    `<diagram name="${xmlEscape(diagramName)}" id="diagram-1">` +
    `<mxGraphModel dx="1422" dy="757" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0">` +
    `<root>` +
    `<mxCell id="0"/>` +
    `<mxCell id="1" parent="0"/>` +
    body +
    `</root>` +
    `</mxGraphModel>` +
    `</diagram>` +
    `</mxfile>`
  );
}

export function triggerDrawioDownload(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
