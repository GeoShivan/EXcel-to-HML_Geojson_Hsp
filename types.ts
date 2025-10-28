
// GeoJSON Types
export interface Point {
    type: "Point";
    coordinates: [number, number];
}

export interface Feature {
    type: "Feature";
    geometry: Point;
    properties: { [key: string]: any };
}

export interface FeatureCollection {
    type: "FeatureCollection";
    features: Feature[];
}

export interface ColumnMapping {
    easting: string | null;
    northing: string | null;
    zone: string | null;
    hemisphere: 'N' | 'S';
}

// Declarations for global libraries from CDN
declare global {
    interface Window {
        XLSX: any;
        proj4: any;
        shpwrite: any;
        saveAs: (blob: Blob, filename: string) => void;
        L: any; // Leaflet
    }
}
