import type { FeatureCollection, ColumnMapping, Feature } from '../types';

/**
 * Helper function to wait for a global library to be available on the window object.
 * @param key - The property name on the window object (e.g., 'shpwrite').
 * @param timeout - Maximum time to wait in milliseconds.
 * @param interval - How often to check for the library.
 * @returns A promise that resolves when the library is found, or rejects on timeout.
 */
const waitForLibrary = (
  key: string,
  timeout = 2000, // Reduced timeout for a local script
  interval = 50
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if ((window as any)[key]) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Local library '${key}' failed to initialize within ${timeout}ms.`));
      } else {
        setTimeout(check, interval);
      }
    };
    check();
  });
};


export const parseExcelFile = (
  file: File
): Promise<{ sheets: string[]; workbook: any }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = window.XLSX.read(data, { type: 'array' });
        const sheets = workbook.SheetNames;
        resolve({ sheets, workbook });
      } catch (error) {
        reject('Failed to read or parse the Excel file.');
      }
    };
    reader.onerror = () => reject('Error reading the file.');
    reader.readAsArrayBuffer(file);
  });
};

export const getSheetData = (workbook: any, sheetName: string, headerRow: number): { headers: string[]; data: any[][] } => {
  const worksheet = workbook.Sheets[sheetName];
  const jsonData: any[][] = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  if (!jsonData || jsonData.length < headerRow) {
    return { headers: [], data: [] };
  }
  
  const headers = jsonData[headerRow - 1].map(String);
  const data = jsonData.slice(headerRow);
  
  return { headers, data };
};


export const convertToGeoJSON = async (
  data: any[][],
  headers: string[],
  mapping: ColumnMapping,
  manualZone: number | null = null,
  onProgress: (progress: number) => void
): Promise<FeatureCollection> => {
  if (!mapping.easting || !mapping.northing) {
    throw new Error('Column mapping for Easting and Northing is incomplete.');
  }
  if (manualZone === null && !mapping.zone) {
    throw new Error('Please map the Zone column or provide a manual zone value.');
  }


  const eastingIndex = headers.indexOf(mapping.easting);
  const northingIndex = headers.indexOf(mapping.northing);
  const zoneIndex = manualZone === null ? headers.indexOf(mapping.zone!) : -1;
  const labelIndex = mapping.label ? headers.indexOf(mapping.label) : -1;

  if (eastingIndex === -1 || northingIndex === -1) {
    throw new Error('One or more mapped columns for Easting or Northing not found in the file.');
  }
  
  if (manualZone === null && zoneIndex === -1) {
      throw new Error('Zone column not found in the file.');
  }
  
  if (mapping.label && labelIndex === -1) {
      throw new Error('Mapped Label column not found in the file.');
  }

  const wgs84 = '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs';
  
  const features: Feature[] = [];
  const dataToProcess = data;
  const totalRows = dataToProcess.length;

  if (totalRows === 0) {
      onProgress(100);
      return { type: 'FeatureCollection', features: [] };
  }

  const CHUNK_SIZE = 500;

  for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
      const chunk = dataToProcess.slice(i, i + CHUNK_SIZE);

      const chunkFeatures = chunk.map((row, index) => {
        const easting = parseFloat(row[eastingIndex]);
        const northing = parseFloat(row[northingIndex]);
        const zone = manualZone !== null ? manualZone : parseInt(row[zoneIndex], 10);
        
        const currentRow = i + index + 1; // 1-based index for user-facing messages

        if (isNaN(easting) || isNaN(northing) || isNaN(zone)) {
          console.warn(`Skipping data row ${currentRow} due to invalid coordinate or zone values.`);
          return null;
        }

        const utm = `+proj=utm +zone=${zone} ${mapping.hemisphere === 'S' ? '+south' : ''} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
        
        try {
          const [lon, lat] = window.proj4(utm, wgs84, [easting, northing]);
          
          const properties = headers.reduce((obj, header, i) => {
            obj[header] = row[i];
            return obj;
          }, {} as { [key: string]: any });

          // If a label column is mapped, ensure a 'name' property exists for compatibility
          if (labelIndex !== -1) {
              properties['name'] = row[labelIndex];
          }

          return {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [lon, lat],
            },
            properties,
          };
        } catch (e) {
            console.error(`Error converting data row ${currentRow}:`, e);
            return null;
        }
      }).filter((feature): feature is Feature => feature !== null);

      features.push(...chunkFeatures);

      const progress = Math.round(((i + chunk.length) / totalRows) * 100);
      onProgress(progress);
      
      // Yield to the main thread to prevent UI from freezing
      await new Promise(resolve => setTimeout(resolve, 0));
  }


  if (features.length === 0) {
      throw new Error("No valid data could be converted. Please check your column mappings and data format.");
  }

  return {
    type: 'FeatureCollection',
    features,
  };
};

export const exportToGeoJSON = (geoData: FeatureCollection, filename: string) => {
  const blob = new Blob([JSON.stringify(geoData, null, 2)], {
    type: 'application/json',
  });
  window.saveAs(blob, `${filename}.geojson`);
};

const escapeXML = (str: string | number | null | undefined) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
};

export const exportToKMZ = async (geoData: FeatureCollection, filename: string) => {
    try {
        await waitForLibrary('JSZip');
    } catch (error) {
        console.error(error);
        throw new Error('JSZip library failed to load. Please try refreshing the page.');
    }

    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${filename}</name>
    ${geoData.features.map(feature => {
        // Basic Name logic - prioritized 'name' which handles our manual mapping
        const name = feature.properties.name || feature.properties.Name || feature.properties.NAME || 'Point';
        
        // Extended Data for preserving all attributes as data
        const extendedData = Object.entries(feature.properties).map(([key, value]) => `
        <Data name="${escapeXML(key)}">
            <value>${escapeXML(value)}</value>
        </Data>`).join('');

        // Description as an HTML table for display in popups
        const description = `<![CDATA[
            <table border="1" style="border-collapse:collapse;border:1px solid #ccc;font-family:sans-serif;font-size:12px;">
                ${Object.entries(feature.properties).map(([key, value]) => `
                <tr>
                    <td style="padding:4px;font-weight:bold;background-color:#f0f0f0;">${key}</td>
                    <td style="padding:4px;">${value}</td>
                </tr>`).join('')}
            </table>
        ]]>`;

        return `
      <Placemark>
        <name>${escapeXML(name)}</name>
        <description>${description}</description>
        <ExtendedData>
            ${extendedData}
        </ExtendedData>
        <Point>
          <coordinates>${feature.geometry.coordinates.join(',')},0</coordinates>
        </Point>
      </Placemark>`;
    }).join('')}
  </Document>
</kml>`;

    const zip = new window.JSZip();
    zip.file("doc.kml", kmlContent);
    
    const blob = await zip.generateAsync({ type: "blob" });
    window.saveAs(blob, `${filename}.kmz`);
};

export const exportToShapefile = async (geoData: FeatureCollection, filename:string) => {
  try {
    await waitForLibrary('shpwrite');
  } catch (error) {
    console.error(error);
    throw new Error('A critical component for Shapefile generation failed to initialize. Please try refreshing the page.');
  }

  const options = {
      folder: filename,
      types: {
          point: `${filename}_points`,
      }
  };
  window.shpwrite.download(geoData, options);
};