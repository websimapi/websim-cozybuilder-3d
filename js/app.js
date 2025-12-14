import React, { useState, useEffect, useRef, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, useGLTF, Environment, Sky, ContactShadows, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Package, Image as ImageIcon, Box, Upload, Settings, ChevronLeft, ChevronRight, Loader2, Sparkles, Move, Trash2 } from 'lucide-react';
import { DataManager } from './db.js';
import { analyzeAsset } from './ai.js';

// --- 3D Components ---

function DraggableAsset({ asset, isSelected, onSelect, position, rotation, onDelete }) {
    const { scene } = useGLTF(asset.url);
    const copiedScene = React.useMemo(() => scene.clone(), [scene]);
    
    // Auto-scale logic could go here based on bounding box
    
    return (
        <group position={position} rotation={rotation} onClick={(e) => {
            e.stopPropagation();
            onSelect();
        }}>
            <primitive object={copiedScene} />
            {isSelected && (
                <Html position={[0, 1.5, 0]}>
                    <div className="bg-white/80 p-2 rounded-full shadow-lg backdrop-blur flex gap-2">
                       <button onClick={onDelete} className="p-1 text-red-500 hover:bg-red-100 rounded">
                           <Trash2 size={16} />
                       </button>
                    </div>
                </Html>
            )}
        </group>
    );
}

function TexturedPlane({ textureUrl, position, rotation, onSelect, isSelected }) {
    const texture = useLoader(THREE.TextureLoader, textureUrl);
    return (
        <mesh position={position} rotation={rotation} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
            <planeGeometry args={[2, 2]} />
            <meshStandardMaterial map={texture} side={THREE.DoubleSide} />
             {isSelected && (
                <Html position={[0, 1.5, 0]}>
                    <div className="bg-white/80 p-1 rounded-full shadow-lg">
                       <Move size={16} className="text-gray-600"/>
                    </div>
                </Html>
            )}
        </mesh>
    );
}

function Scene({ placedItems, selectedId, onSelect, updateItem }) {
    return (
        <>
            <ambientLight intensity={0.7} />
            <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
            <Sky sunPosition={[100, 20, 100]} turbidity={0.5} rayleigh={0.5} />
            <Environment preset="city" />
            
            <Grid infiniteGrid sectionColor="#c8b6a6" cellColor="#e8e4da" sectionSize={3} cellSize={1} fadeDistance={30} />
            <ContactShadows opacity={0.4} scale={20} blur={2} far={4.5} />

            <group>
                {placedItems.map(item => {
                    const isSelected = item.instanceId === selectedId;
                    
                    return (
                        <group key={item.instanceId}>
                            {item.assetType === 'model' ? (
                                <DraggableAsset 
                                    asset={item} 
                                    position={item.position}
                                    rotation={item.rotation || [0,0,0]}
                                    isSelected={isSelected}
                                    onSelect={() => onSelect(item.instanceId)}
                                    onDelete={() => updateItem(item.instanceId, null)} // Null means delete
                                />
                            ) : (
                                <TexturedPlane 
                                    textureUrl={item.url} 
                                    position={item.position}
                                    rotation={item.rotation || [-Math.PI/2, 0, 0]}
                                    isSelected={isSelected}
                                    onSelect={() => onSelect(item.instanceId)}
                                />
                            )}
                            
                            {isSelected && (
                                <TransformControls 
                                    object={undefined} 
                                    position={item.position}
                                    rotation={item.rotation || [0,0,0]}
                                    onObjectChange={(e) => {
                                        // Update position in state when transform ends
                                        if(e?.target?.object) {
                                             updateItem(item.instanceId, {
                                                position: [e.target.object.position.x, e.target.object.position.y, e.target.object.position.z],
                                                rotation: [e.target.object.rotation.x, e.target.object.rotation.y, e.target.object.rotation.z]
                                            });
                                        }
                                    }}
                                    mode="translate" 
                                />
                            )}
                        </group>
                    );
                })}
            </group>

            <OrbitControls makeDefault />
        </>
    );
}

// --- UI Components ---

function AssetCard({ asset, onClick }) {
    return (
        <div 
            onClick={onClick}
            className="asset-card cursor-pointer bg-white rounded-xl overflow-hidden shadow-sm border border-[var(--sand)] flex flex-col h-32 w-28 shrink-0 relative group"
        >
            <div className="h-20 bg-[var(--sand)] flex items-center justify-center overflow-hidden">
                {asset.assetType === 'texture' || asset.assetType === 'image' ? (
                    <img src={asset.url} className="w-full h-full object-cover" />
                ) : (
                    <Box className="text-[var(--wood)] w-10 h-10" />
                )}
            </div>
            <div className="p-2 flex-1 flex flex-col justify-between">
                <p className="text-xs font-bold text-[var(--dark)] truncate">{asset.title}</p>
                <div className="flex gap-1">
                    <span className="text-[10px] bg-[var(--cream)] px-1 rounded text-[var(--clay)] border border-[var(--sand)]">{asset.category}</span>
                </div>
            </div>
            {/* Quick Info Overlay */}
            <div className="absolute inset-0 bg-black/50 text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center text-center text-xs">
                {asset.description || "No description"}
            </div>
        </div>
    );
}

function UploadModal({ onClose, onUpload }) {
    const [file, setFile] = useState(null);
    const [prompt, setPrompt] = useState("");
    const [analyzing, setAnalyzing] = useState(false);

    const handleFileChange = (e) => {
        if (e.target.files[0]) setFile(e.target.files[0]);
    };

    const handleSubmit = async () => {
        if (!file) return;
        setAnalyzing(true);
        try {
            // 1. Upload
            const url = await websim.upload(file);
            
            // 2. AI Analyze
            const metadata = await analyzeAsset(file, url, prompt);
            
            // 3. Save
            await onUpload(metadata);
            onClose();
        } catch (e) {
            console.error(e);
            alert("Upload failed. check console.");
        } finally {
            setAnalyzing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
            <div className="bg-white w-96 rounded-2xl p-6 shadow-2xl border border-[var(--sand)]">
                <h2 className="text-xl font-bold text-[var(--dark)] mb-4 flex items-center gap-2">
                    <Sparkles className="text-[var(--wood)]" /> New Asset
                </h2>
                
                <div className="space-y-4">
                    <div className="border-2 border-dashed border-[var(--clay)] rounded-xl p-8 text-center hover:bg-[var(--cream)] transition-colors relative">
                        <input type="file" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" accept=".glb,.gltf,.png,.jpg,.jpeg" />
                        {file ? (
                            <span className="text-[var(--wood)] font-semibold">{file.name}</span>
                        ) : (
                            <div className="text-[var(--clay)]">
                                <Upload className="mx-auto mb-2" />
                                <p className="text-sm">Drop 3D (.glb) or 2D (.png) here</p>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="text-xs font-bold text-[var(--wood)] uppercase tracking-wider">AI Context (Optional)</label>
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="e.g. A vintage velvet armchair..." 
                            className="w-full mt-1 p-3 rounded-lg bg-[var(--cream)] border border-[var(--sand)] text-sm focus:outline-none focus:border-[var(--sage)]"
                            rows="2"
                        ></textarea>
                        <p className="text-[10px] text-[var(--clay)] mt-1">Our AI will generate name, tags, and placement info.</p>
                    </div>

                    <button 
                        onClick={handleSubmit} 
                        disabled={!file || analyzing}
                        className="w-full py-3 bg-[var(--wood)] text-[var(--cream)] rounded-xl font-bold shadow-lg hover:bg-[var(--dark)] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 cozy-btn"
                    >
                        {analyzing ? <Loader2 className="animate-spin" /> : 'Analyze & Add'}
                    </button>
                    
                    <button onClick={onClose} className="w-full text-sm text-[var(--clay)] hover:text-[var(--dark)]">Cancel</button>
                </div>
            </div>
        </div>
    );
}

// --- Main App Component ---

function App() {
    const [dbManager] = useState(() => new DataManager());
    const [assets, setAssets] = useState([]);
    const [placedItems, setPlacedItems] = useState([]); // { instanceId, assetId, ...assetData, position, rotation }
    const [loading, setLoading] = useState(true);
    const [showUpload, setShowUpload] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedId, setSelectedId] = useState(null);

    // Initial Load
    useEffect(() => {
        dbManager.init().then((data) => {
            setAssets(data.assets_json.items);
            setLoading(false);
        });
    }, []);

    const handleUploadAsset = async (metadata) => {
        const newAsset = await dbManager.addAsset(metadata);
        setAssets(prev => [newAsset, ...prev]);
    };

    const handlePlaceAsset = (asset) => {
        // Place in center of screenish
        const newItem = {
            ...asset,
            instanceId: Date.now().toString(), // simple unique id for scene instance
            position: [0, 0, 0],
            rotation: [0, 0, 0]
        };
        setPlacedItems(prev => [...prev, newItem]);
    };

    const handleUpdateItem = (instanceId, newData) => {
        if (newData === null) {
            setPlacedItems(prev => prev.filter(i => i.instanceId !== instanceId));
            setSelectedId(null);
        } else {
            setPlacedItems(prev => prev.map(item => 
                item.instanceId === instanceId ? { ...item, ...newData } : item
            ));
        }
    };

    // Filter Logic
    const categories = ['All', 'model', 'texture'];
    const filteredAssets = selectedCategory === 'All' 
        ? assets 
        : assets.filter(a => a.assetType === selectedCategory);

    if (loading) return (
        <div className="h-screen w-screen flex items-center justify-center bg-[var(--cream)]">
            <div className="text-center">
                <div className="loader mx-auto mb-4"></div>
                <h1 className="text-xl font-bold text-[var(--wood)]">Loading Studio...</h1>
                <p className="text-[var(--clay)] text-sm">Syncing your personal database</p>
            </div>
        </div>
    );

    return (
        <div className="h-screen w-screen relative">
            {/* 3D Viewport */}
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-blue-50 to-[var(--sand)]">
                <Canvas shadows camera={{ position: [5, 5, 5], fov: 50 }}>
                    <Suspense fallback={null}>
                        <Scene 
                            placedItems={placedItems} 
                            selectedId={selectedId} 
                            onSelect={setSelectedId}
                            updateItem={handleUpdateItem}
                        />
                    </Suspense>
                </Canvas>
            </div>

            {/* Top UI: Asset Browser */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 pointer-events-none">
                <div className="max-w-4xl mx-auto pointer-events-auto">
                    
                    {/* Header / Filter Bar */}
                    <div className="glass-panel rounded-2xl p-2 mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 px-2">
                            <span className="font-bold text-[var(--dark)]">My Studio</span>
                            <div className="h-4 w-px bg-[var(--clay)] mx-2"></div>
                            
                            <div className="flex gap-1 bg-[var(--sand)]/50 p-1 rounded-lg">
                                {categories.map(cat => (
                                    <button 
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-3 py-1 rounded-md text-sm transition-all ${selectedCategory === cat ? 'bg-white shadow-sm text-[var(--wood)] font-bold' : 'text-[var(--clay)] hover:text-[var(--dark)]'}`}
                                    >
                                        {cat === 'model' ? '3D Models' : cat === 'texture' ? 'Textures' : cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button 
                            onClick={() => setShowUpload(true)}
                            className="bg-[var(--wood)] text-[var(--cream)] px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-[var(--dark)] flex items-center gap-2 cozy-btn"
                        >
                            <Upload size={16} /> Upload
                        </button>
                    </div>

                    {/* Horizontal Asset Scroll */}
                    <div className="relative group">
                        <div className="overflow-x-auto pb-4 hide-scrollbar flex gap-3 px-1 scroll-smooth" id="asset-scroller">
                            {filteredAssets.length === 0 ? (
                                <div className="glass-panel w-full p-8 text-center rounded-2xl text-[var(--clay)] border-dashed border-2 border-[var(--clay)]">
                                    <Package className="mx-auto mb-2 opacity-50" />
                                    No assets yet. Upload something to start building!
                                </div>
                            ) : (
                                filteredAssets.map(asset => (
                                    <AssetCard key={asset.id} asset={asset} onClick={() => handlePlaceAsset(asset)} />
                                ))
                            )}
                        </div>
                        
                        {/* Bumpers */}
                        <button 
                            className="absolute left-0 top-1/2 -translate-y-1/2 -ml-3 bg-white shadow-lg rounded-full p-2 text-[var(--wood)] opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                            onClick={() => document.getElementById('asset-scroller').scrollBy({left: -200, behavior: 'smooth'})}
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <button 
                            className="absolute right-0 top-1/2 -translate-y-1/2 -mr-3 bg-white shadow-lg rounded-full p-2 text-[var(--wood)] opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                            onClick={() => document.getElementById('asset-scroller').scrollBy({left: 200, behavior: 'smooth'})}
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom/Context UI (Instructions) */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                 <div className="glass-panel px-6 py-2 rounded-full text-xs font-semibold text-[var(--dark)] shadow-lg flex items-center gap-2">
                    <Move size={12} />
                    <span>Click assets to select</span>
                    <span className="text-[var(--clay)]">|</span>
                    <span>Drag to move</span>
                    <span className="text-[var(--clay)]">|</span>
                    <span>Click + Trash to delete</span>
                 </div>
            </div>

            {/* Upload Modal */}
            {showUpload && (
                <UploadModal 
                    onClose={() => setShowUpload(false)} 
                    onUpload={handleUploadAsset} 
                />
            )}
        </div>
    );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);

