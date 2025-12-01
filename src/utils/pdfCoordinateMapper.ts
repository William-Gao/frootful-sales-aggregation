import { PDFPageProxy } from 'pdfjs-dist';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextPosition {
  text: string;
  boundingBox: BoundingBox;
  page: number;
}

/**
 * Extracts text content with positions from a PDF page
 */
export async function extractTextPositions(
  page: PDFPageProxy,
  scale: number = 1.5
): Promise<TextPosition[]> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale });
  const positions: TextPosition[] = [];

  textContent.items.forEach((item: any) => {
    if (!item.str || item.str.trim() === '') return;

    // Get transformation matrix: [scaleX, 0, 0, scaleY, x, y]
    const transform = item.transform;
    const x = transform[4];
    const y = transform[5];
    const width = item.width || 100;
    const height = item.height || 12;

    // Convert coordinates (PDF coordinates are bottom-up)
    const adjustedY = viewport.height - y - height;

    positions.push({
      text: item.str,
      boundingBox: {
        x: x * scale,
        y: adjustedY * scale,
        width: width * scale,
        height: height * scale
      },
      page: page.pageNumber
    });
  });

  return positions;
}

/**
 * Performs fuzzy text matching to find if searchText appears in targetText
 */
export function fuzzyMatch(searchText: string, targetText: string): boolean {
  const search = searchText.toLowerCase().trim();
  const target = targetText.toLowerCase().trim();

  // Exact match
  if (target.includes(search) || search.includes(target)) {
    return true;
  }

  // Word-by-word matching
  const searchWords = search.split(/\s+/);
  const targetWords = target.split(/\s+/);

  // Check if all search words appear in target
  const allWordsMatch = searchWords.every(word =>
    targetWords.some(targetWord => targetWord.includes(word) || word.includes(targetWord))
  );

  if (allWordsMatch && searchWords.length > 1) {
    return true;
  }

  // Check for substantial overlap (at least 70% of characters match)
  const minLength = Math.min(search.length, target.length);
  if (minLength < 3) return false;

  let matches = 0;
  for (let i = 0; i < minLength; i++) {
    if (search[i] === target[i]) matches++;
  }

  return matches / minLength > 0.7;
}

/**
 * Finds the bounding box for a given search text in the PDF
 */
export function findTextBoundingBox(
  searchText: string,
  textPositions: TextPosition[]
): BoundingBox | null {
  // Try exact or fuzzy match first
  for (const position of textPositions) {
    if (fuzzyMatch(searchText, position.text)) {
      return position.boundingBox;
    }
  }

  // Try to find text that contains any word from search text
  const searchWords = searchText.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  for (const word of searchWords) {
    for (const position of textPositions) {
      if (position.text.toLowerCase().includes(word)) {
        return position.boundingBox;
      }
    }
  }

  // Try to merge adjacent text items that together form the search text
  for (let i = 0; i < textPositions.length - 1; i++) {
    let combinedText = textPositions[i].text;
    let minX = textPositions[i].boundingBox.x;
    let minY = textPositions[i].boundingBox.y;
    let maxX = textPositions[i].boundingBox.x + textPositions[i].boundingBox.width;
    let maxY = textPositions[i].boundingBox.y + textPositions[i].boundingBox.height;

    for (let j = i + 1; j < Math.min(i + 5, textPositions.length); j++) {
      combinedText += ' ' + textPositions[j].text;

      if (fuzzyMatch(searchText, combinedText)) {
        minX = Math.min(minX, textPositions[j].boundingBox.x);
        minY = Math.min(minY, textPositions[j].boundingBox.y);
        maxX = Math.max(maxX, textPositions[j].boundingBox.x + textPositions[j].boundingBox.width);
        maxY = Math.max(maxY, textPositions[j].boundingBox.y + textPositions[j].boundingBox.height);

        return {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        };
      }
    }
  }

  return null;
}

/**
 * Groups nearby text positions into lines
 */
export function groupIntoLines(textPositions: TextPosition[]): TextPosition[][] {
  if (textPositions.length === 0) return [];

  // Sort by Y position first, then X position
  const sorted = [...textPositions].sort((a, b) => {
    const yDiff = a.boundingBox.y - b.boundingBox.y;
    if (Math.abs(yDiff) < 5) { // Same line threshold
      return a.boundingBox.x - b.boundingBox.x;
    }
    return yDiff;
  });

  const lines: TextPosition[][] = [];
  let currentLine: TextPosition[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    // Check if on same line (Y positions are close)
    if (Math.abs(curr.boundingBox.y - prev.boundingBox.y) < 5) {
      currentLine.push(curr);
    } else {
      lines.push(currentLine);
      currentLine = [curr];
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Merges a line of text positions into a single text position
 */
export function mergeLineTextPositions(line: TextPosition[]): TextPosition {
  if (line.length === 0) {
    throw new Error('Cannot merge empty line');
  }

  if (line.length === 1) {
    return line[0];
  }

  const text = line.map(p => p.text).join(' ');
  const minX = Math.min(...line.map(p => p.boundingBox.x));
  const minY = Math.min(...line.map(p => p.boundingBox.y));
  const maxX = Math.max(...line.map(p => p.boundingBox.x + p.boundingBox.width));
  const maxY = Math.max(...line.map(p => p.boundingBox.y + p.boundingBox.height));

  return {
    text,
    boundingBox: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    },
    page: line[0].page
  };
}
