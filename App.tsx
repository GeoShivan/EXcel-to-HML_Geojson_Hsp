import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { FeatureCollection, ColumnMapping } from './types';
import { parseExcelFile, getSheetData, convertToGeoJSON, exportToGeoJSON, exportToKMZ, exportToShapefile } from './services/fileConverter';

const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M12 15l4-4m-4 4l-4-4m4-4v11" />
    </svg>
);

const FileIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

const MapIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 16.382V5.618a1 1 0 00-1.447-.894L15 7m-6 13v-6.5m6 10V7" /></svg>;
const KMZIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const ShapefileIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>;


const App: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [workbook, setWorkbook] = useState<any | null>(null);
    const [sheets, setSheets] = useState<string[]>([]);
    const [selectedSheet, setSelectedSheet] = useState<string>('');
    const [headers, setHeaders] = useState<string[]>([]);
    const [data, setData] = useState<any[][]>([]);
    const [columnMapping, setColumnMapping] = useState<ColumnMapping>({ easting: null, northing: null, zone: null, hemisphere: 'N', label: null });
    const [zoneInputMode, setZoneInputMode] = useState<'column' | 'manual'>('column');
    const [manualZone, setManualZone] = useState<string>('');
    const [headerRow, setHeaderRow] = useState<number>(1);
    const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number>(0);

    const mapRef = useRef<any>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    
    const resetState = () => {
        setFile(null);
        setWorkbook(null);
        setSheets([]);
        setSelectedSheet('');
        setHeaders([]);
        setData([]);
        setColumnMapping({ easting: null, northing: null, zone: null, hemisphere: 'N', label: null });
        setZoneInputMode('column');
        setManualZone('');
        setHeaderRow(1);
        setGeoData(null);
        setError(null);
        setIsLoading(false);
        setProgress(0);
    };

    const handleFileChange = async (selectedFile: File) => {
        if (!selectedFile) return;
        resetState();
        setIsLoading(true);
        setError(null);
        try {
            const { sheets: sheetNames, workbook: wb } = await parseExcelFile(selectedFile);
            setFile(selectedFile);
            setWorkbook(wb);
            setSheets(sheetNames);
            if (sheetNames.length > 0) {
                setSelectedSheet(sheetNames[0]);
            } else {
                setError("No sheets found in the Excel file.");
            }
        } catch (err) {
            setError(typeof err === 'string' ? err : 'An unknown error occurred during file processing.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSheetChange = (sheetName: string) => {
        setSelectedSheet(sheetName);
        setGeoData(null); // Reset converted data if sheet changes
    };

    useEffect(() => {
        if (workbook && selectedSheet) {
            try {
                const { headers: sheetHeaders, data: sheetData } = getSheetData(workbook, selectedSheet, headerRow);
                setHeaders(sheetHeaders);
                setData(sheetData);
                // Auto-map columns if common names exist
                const lowerCaseHeaders = sheetHeaders.map(h => h.toLowerCase());
                setColumnMapping(prev => ({
                    ...prev,
                    easting: sheetHeaders[lowerCaseHeaders.findIndex(h => h.includes('easting') || h === 'x')] || null,
                    northing: sheetHeaders[lowerCaseHeaders.findIndex(h => h.includes('northing') || h === 'y')] || null,
                    zone: sheetHeaders[lowerCaseHeaders.findIndex(h => h.includes('zone'))] || null,
                    label: sheetHeaders[lowerCaseHeaders.findIndex(h => h.includes('name') || h.includes('label') || h.includes('id') || h === 'code')] || null,
                }));

            } catch (err) {
                 setError('Failed to read data from the selected sheet.');
                 console.error(err);
            }
        }
    }, [workbook, selectedSheet, headerRow]);
    
    const handleClearMapping = () => {
        setColumnMapping(prev => ({
            ...prev, // Keep hemisphere
            easting: null,
            northing: null,
            zone: null,
            label: null,
        }));
    };

    const handleConversion = async () => {
        setError(null);
        setGeoData(null);
    
        const validationErrors: string[] = [];
        if (!columnMapping.easting) {
            validationErrors.push("Easting");
        }
        if (!columnMapping.northing) {
            validationErrors.push("Northing");
        }
    
        const isManualZone = zoneInputMode === 'manual';
        const manualZoneNumber = isManualZone ? parseInt(manualZone, 10) : null;
    
        if (zoneInputMode === 'column' && !columnMapping.zone) {
            validationErrors.push("Zone Column");
        }
    
        let combinedError = "";
        if (validationErrors.length > 0) {
            combinedError += `Required column mapping missing for: ${validationErrors.join(', ')}. `;
        }
    
        if (isManualZone && (isNaN(manualZoneNumber!) || manualZoneNumber! < 1 || manualZoneNumber! > 60)) {
            combinedError += "Please enter a valid manual zone number (1-60).";
        }
    
        if (combinedError) {
            setError(combinedError.trim());
            return;
        }
    
        setIsLoading(true);
        setProgress(0);
        try {
            const convertedData = await convertToGeoJSON(data, headers, columnMapping, isManualZone ? manualZoneNumber : null, setProgress);
            setGeoData(convertedData);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (geoData && mapContainerRef.current) {
            if (!mapRef.current) {
                mapRef.current = window.L.map(mapContainerRef.current).setView([0, 0], 2);
                window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(mapRef.current);
            }
            
            // Clear previous layers
            mapRef.current.eachLayer((layer:any) => {
                if (!!layer.toGeoJSON) {
                    mapRef.current.removeLayer(layer);
                }
            });

            const geoJsonLayer = window.L.geoJSON(geoData, {
                onEachFeature: (feature: any, layer: any) => {
                    const properties = Object.entries(feature.properties)
                        .map(([key, value]) => `<b>${key}:</b> ${value}`)
                        .join('<br>');
                    layer.bindPopup(properties);
                    
                    // Show tooltip if 'name' property exists (set by label mapping)
                    if (feature.properties.name) {
                        layer.bindTooltip(String(feature.properties.name));
                    }
                }
            }).addTo(mapRef.current);

            if (geoData.features.length > 0) {
                 mapRef.current.fitBounds(geoJsonLayer.getBounds(), { padding: [50, 50] });
            }
        }
    }, [geoData]);

    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => e.preventDefault();
    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileChange(e.dataTransfer.files[0]);
        }
    };
    
    const handleZoneModeChange = (mode: 'column' | 'manual') => {
        setZoneInputMode(mode);
        if (mode === 'column') {
            setManualZone('');
        } else {
            setColumnMapping(prev => ({ ...prev, zone: null }));
        }
    };

    const handleExport = async (format: 'geojson' | 'kmz' | 'shapefile') => {
        if (!geoData || !file) return;
        setError(null);
        try {
            const filename = file.name.split('.')[0];
            switch(format) {
                case 'geojson':
                    exportToGeoJSON(geoData, filename);
                    break;
                case 'kmz':
                    await exportToKMZ(geoData, filename);
                    break;
                case 'shapefile':
                    await exportToShapefile(geoData, filename);
                    break;
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            console.error(err);
        }
    };
    
    const isEastingInvalid = !columnMapping.easting;
    const isNorthingInvalid = !columnMapping.northing;
    const isColumnZoneInvalid = zoneInputMode === 'column' && !columnMapping.zone;
    const isManualZoneInvalid = zoneInputMode === 'manual' && (manualZone === '' || isNaN(parseInt(manualZone)) || parseInt(manualZone) < 1 || parseInt(manualZone) > 60);
    const isConvertDisabled = isEastingInvalid || isNorthingInvalid || isColumnZoneInvalid || isManualZoneInvalid || isLoading;
    
    const baseSelectClasses = "w-full bg-gray-700 rounded-md shadow-sm transition-colors";
    const validSelectClasses = "border-gray-600 focus:ring-emerald-500 focus:border-emerald-500";
    const invalidSelectClasses = "border-red-500 focus:ring-red-500 focus:border-red-500";


    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">UTM Coordinate Converter</h1>
                    <p className="mt-2 text-lg text-gray-400">Convert Excel UTM data to Shapefile, KMZ, or GeoJSON with ease.</p>
                </header>

                <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column: Controls */}
                    <div className="bg-gray-800/50 p-6 rounded-2xl shadow-lg ring-1 ring-white/10">
                        {/* Step 1: File Upload */}
                        <div className="mb-6">
                           <h2 className="text-2xl font-bold mb-4 border-b-2 border-emerald-500/30 pb-2">Step 1: Upload File</h2>
                            {!file ? (
                                <label 
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                    className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors"
                                >
                                    <UploadIcon />
                                    <p className="mb-2 text-sm text-gray-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                    <p className="text-xs text-gray-500">XLSX or XLS files</p>
                                    <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => e.target.files && handleFileChange(e.target.files[0])} />
                                </label>
                            ) : (
                                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                                    <div className="flex items-center space-x-3">
                                        <FileIcon />
                                        <span className="font-medium text-white">{file.name}</span>
                                    </div>
                                    <button onClick={resetState} className="text-sm text-red-400 hover:text-red-300 font-semibold">
                                        Remove
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        {/* Step 2: Configure Data */}
                        {file && (
                           <div>
                               <div className="flex justify-between items-baseline mb-4 border-b-2 border-emerald-500/30 pb-2">
                                   <h2 className="text-2xl font-bold">Step 2: Configure Data</h2>
                                   <button 
                                       onClick={handleClearMapping} 
                                       className="text-sm text-cyan-400 hover:text-cyan-300 font-semibold transition-colors duration-150"
                                   >
                                       Clear Mappings
                                   </button>
                               </div>

                               <div className="space-y-4">
                                   <div>
                                       <label htmlFor="sheet" className="block text-sm font-medium text-gray-300 mb-1">Select Sheet</label>
                                       <select id="sheet" value={selectedSheet} onChange={(e) => handleSheetChange(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500">
                                           {sheets.map(name => <option key={name} value={name}>{name}</option>)}
                                       </select>
                                   </div>

                                    {headers.length > 0 && (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label htmlFor="easting" className="block text-sm font-medium text-gray-300 mb-1 capitalize">Easting <span className="text-red-400">*</span></label>
                                                <select
                                                    id="easting"
                                                    value={columnMapping.easting || ''}
                                                    onChange={(e) => setColumnMapping({...columnMapping, easting: e.target.value})}
                                                    className={`${baseSelectClasses} ${isEastingInvalid ? invalidSelectClasses : validSelectClasses}`}
                                                >
                                                    <option value="">Select column...</option>
                                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label htmlFor="northing" className="block text-sm font-medium text-gray-300 mb-1 capitalize">Northing <span className="text-red-400">*</span></label>
                                                <select
                                                    id="northing"
                                                    value={columnMapping.northing || ''}
                                                    onChange={(e) => setColumnMapping({...columnMapping, northing: e.target.value})}
                                                    className={`${baseSelectClasses} ${isNorthingInvalid ? invalidSelectClasses : validSelectClasses}`}
                                                >
                                                    <option value="">Select column...</option>
                                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                                    Zone {zoneInputMode === 'column' && <span className="text-red-400">*</span>}
                                                </label>
                                                <div className="flex items-center space-x-4 mb-2">
                                                    <div className="flex items-center">
                                                        <input id="zone-column" name="zone-mode" type="radio" checked={zoneInputMode === 'column'} onChange={() => handleZoneModeChange('column')} className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-500"/>
                                                        <label htmlFor="zone-column" className="ml-2 block text-sm text-gray-300">Column</label>
                                                    </div>
                                                    <div className="flex items-center">
                                                        <input id="zone-manual" name="zone-mode" type="radio" checked={zoneInputMode === 'manual'} onChange={() => handleZoneModeChange('manual')} className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-500"/>
                                                        <label htmlFor="zone-manual" className="ml-2 block text-sm text-gray-300">Manual</label>
                                                    </div>
                                                </div>
                                                {zoneInputMode === 'column' ? (
                                                    <select 
                                                        id="zone" 
                                                        value={columnMapping.zone || ''} 
                                                        onChange={(e) => setColumnMapping({ ...columnMapping, zone: e.target.value || null })} 
                                                        className={`${baseSelectClasses} ${isColumnZoneInvalid ? invalidSelectClasses : validSelectClasses}`}
                                                    >
                                                        <option value="">Select column...</option>
                                                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                ) : (
                                                    <input type="number" id="manualZone" placeholder="e.g., 30" min="1" max="60" value={manualZone} onChange={e => setManualZone(e.target.value)} 
                                                    className={`w-full bg-gray-700 rounded-md shadow-sm ${
                                                        isManualZoneInvalid
                                                            ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                                                            : 'border-gray-600 focus:ring-emerald-500 focus:border-emerald-500'
                                                    }`}/>
                                                )}
                                            </div>
                                            <div>
                                                <label htmlFor="hemisphere" className="block text-sm font-medium text-gray-300 mb-1">Hemisphere</label>
                                                <select
                                                    id="hemisphere"
                                                    value={columnMapping.hemisphere}
                                                    onChange={(e) => setColumnMapping({...columnMapping, hemisphere: e.target.value as 'N' | 'S'})}
                                                    className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500"
                                                >
                                                    <option value="N">North</option>
                                                    <option value="S">South</option>
                                                </select>
                                            </div>
                                            
                                            {/* Label Column Control */}
                                            <div>
                                                <label htmlFor="labelCol" className="block text-sm font-medium text-gray-300 mb-1">Label / Name (Optional)</label>
                                                <select
                                                    id="labelCol"
                                                    value={columnMapping.label || ''}
                                                    onChange={(e) => setColumnMapping({...columnMapping, label: e.target.value || null})}
                                                    className={baseSelectClasses + " border-gray-600 focus:ring-emerald-500 focus:border-emerald-500"}
                                                >
                                                    <option value="">Select column...</option>
                                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                </select>
                                            </div>

                                             <div>
                                                <label htmlFor="headerRow" className="block text-sm font-medium text-gray-300 mb-1">Header is on row</label>
                                                <input
                                                    type="number"
                                                    id="headerRow"
                                                    min="1"
                                                    value={headerRow}
                                                    onChange={e => setHeaderRow(parseInt(e.target.value, 10) || 1)}
                                                    className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-emerald-500 focus:border-emerald-500"
                                                />
                                            </div>
                                        </div>
                                       
                                        <div className="mt-4">
                                            <button 
                                                onClick={handleConversion} 
                                                disabled={isConvertDisabled}
                                                className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-500 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-emerald-500 transition-colors"
                                            >
                                                {isLoading && !geoData ? `Converting... ${progress}%` : 'Convert Data'}
                                            </button>
                                            {isLoading && !geoData && (
                                                <div className="w-full bg-gray-600 rounded-full h-2.5 mt-3">
                                                    <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-150 ease-linear" style={{ width: `${progress}%` }}></div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                    )}
                               </div>
                           </div>
                        )}
                    </div>

                    {/* Right Column: Preview & Export */}
                    <div className="bg-gray-800/50 p-6 rounded-2xl shadow-lg ring-1 ring-white/10 flex flex-col">
                        {error && (
                            <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded-lg mb-4" role="alert">
                                <strong className="font-bold">Error: </strong>
                                <span className="block sm:inline">{error}</span>
                            </div>
                        )}

                        {!geoData && !isLoading && (
                            <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-500">
                                <MapIcon />
                                <h3 className="text-xl font-semibold mt-4">Data Preview</h3>
                                <p className="mt-1">Upload and process a file to see a preview of your data on the map.</p>
                            </div>
                        )}
                        
                        {isLoading && !geoData && (
                            <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-400">
                                 <svg className="animate-spin h-10 w-10 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                <h3 className="text-xl font-semibold mt-4">Processing Data...</h3>
                                <div className="w-3/4 bg-gray-600 rounded-full h-2.5 mt-4">
                                    <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-150 ease-linear" style={{ width: `${progress}%` }}></div>
                                </div>
                                <p className="text-sm text-gray-500 mt-2">{progress}%</p>
                            </div>
                        )}

                        {geoData && (
                           <div className="flex flex-col flex-grow">
                               <h2 className="text-2xl font-bold mb-4 border-b-2 border-cyan-500/30 pb-2">Step 3: Preview & Export</h2>
                               <div className="mb-4">
                                   <p className="text-green-400">Successfully converted <span className="font-bold">{geoData.features.length}</span> points.</p>
                               </div>

                               <div ref={mapContainerRef} className="h-64 md:h-80 w-full rounded-lg bg-gray-700 mb-6 ring-1 ring-white/10" style={{minHeight: '250px'}}></div>
                                
                               <div>
                                    <h3 className="text-xl font-bold mb-3">Export Options</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <button onClick={() => handleExport('geojson')} className="flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md text-cyan-100 bg-cyan-600 hover:bg-cyan-700 transition-colors">
                                            <MapIcon /> GeoJSON
                                        </button>
                                        <button onClick={() => handleExport('kmz')} className="flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md text-amber-100 bg-amber-600 hover:bg-amber-700 transition-colors">
                                           <KMZIcon /> KMZ
                                        </button>
                                        <button onClick={() => handleExport('shapefile')} className="flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md text-fuchsia-100 bg-fuchsia-600 hover:bg-fuchsia-700 transition-colors">
                                            <ShapefileIcon /> Shapefile
                                        </button>
                                    </div>
                               </div>
                           </div>
                        )}
                    </div>
                </main>

                <footer className="text-center mt-12 text-gray-500 text-sm">
                    <p>Built with passion by a world-class React engineer.</p>
                </footer>
            </div>
        </div>
    );
};

export default App;