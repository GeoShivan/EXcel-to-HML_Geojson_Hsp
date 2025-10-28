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

export const getSheetData = (workbook: any, sheetName: string): { headers: string[]; data: any[][] } => {
  const worksheet = workbook.Sheets[sheetName];
  const jsonData: any[][] = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  if (!jsonData || jsonData.length === 0) {
    return { headers: [], data: [] };
  }
  
  const headers = jsonData[0].map(String);
  const data = jsonData.slice(1);
  
  return { headers, data };
};


export const convertToGeoJSON = (
  data: any[][],
  headers: string[],
  mapping: ColumnMapping,
  startRow: number,
  manualZone: number | null = null
): FeatureCollection => {
  if (!mapping.easting || !mapping.northing) {
    throw new Error('Column mapping for Easting and Northing is incomplete.');
  }
  if (manualZone === null && !mapping.zone) {
    throw new Error('Please map the Zone column or provide a manual zone value.');
  }


  const eastingIndex = headers.indexOf(mapping.easting);
  const northingIndex = headers.indexOf(mapping.northing);
  const zoneIndex = manualZone === null ? headers.indexOf(mapping.zone!) : -1;

  if (eastingIndex === -1 || northingIndex === -1) {
    throw new Error('One or more mapped columns for Easting or Northing not found in the file.');
  }
  
  if (manualZone === null && zoneIndex === -1) {
      throw new Error('Zone column not found in the file.');
  }

  const wgs84 = '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs';
  
  const features: Feature[] = data.slice(startRow - 1).map((row, index) => {
    const easting = parseFloat(row[eastingIndex]);
    const northing = parseFloat(row[northingIndex]);
    const zone = manualZone !== null ? manualZone : parseInt(row[zoneIndex], 10);
    
    if (isNaN(easting) || isNaN(northing) || isNaN(zone)) {
      console.warn(`Skipping row ${index + startRow} due to invalid coordinate or zone values.`);
      return null;
    }

    const utm = `+proj=utm +zone=${zone} ${mapping.hemisphere === 'S' ? '+south' : ''} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
    
    try {
      const [lon, lat] = window.proj4(utm, wgs84, [easting, northing]);
      
      const properties = headers.reduce((obj, header, i) => {
        obj[header] = row[i];
        return obj;
      }, {} as { [key: string]: any });

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        properties,
      };
    } catch (e) {
        console.error(`Error converting row ${index + startRow}:`, e);
        return null;
    }
  }).filter((feature): feature is Feature => feature !== null);

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

export const exportToKML = (geoData: FeatureCollection, filename: string) => {
    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${filename}</name>
    ${geoData.features.map(feature => `
      <Placemark>
        <name>${feature.properties.Name || 'Point'}</name>
        <description>
          <![CDATA[
            ${Object.entries(feature.properties).map(([key, value]) => `<b>${key}:</b> ${value}<br>`).join('')}
          ]]>
        </description>
        <Point>
          <coordinates>${feature.geometry.coordinates.join(',')},0</coordinates>
        </Point>
      </Placemark>
    `).join('')}
  </Document>
</kml>`;

    const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
    window.saveAs(blob, `${filename}.kml`);
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