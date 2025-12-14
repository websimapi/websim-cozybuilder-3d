/**
 * AI Service for generating metadata for 3D assets
 */

export async function analyzeAsset(file, url, userPrompt = "") {
    const filename = file.name;
    const fileType = file.type;
    const isImage = fileType.startsWith('image/');
    const isModel = filename.endsWith('.glb') || filename.endsWith('.gltf') || filename.endsWith('.obj');

    // 1. Determine Basic Type
    let assetType = 'unknown';
    if (isImage) assetType = 'texture'; // Default to texture/image
    if (isModel) assetType = 'model';

    // 2. Prepare AI Request
    let messages = [
        {
            role: "system",
            content: `You are an asset librarian for a 3D house builder game. 
            Analyze the input file information and return a JSON object.
            
            JSON Schema:
            {
                "title": "string (Display name)",
                "category": "string (One of: 'Furniture', 'Structure', 'Decor', 'Surface', 'Nature', 'Other')",
                "description": "string (Short cozy description)",
                "tags": ["string", "string"],
                "placementType": "string (One of: 'floor', 'wall', 'ceiling', 'free')"
            }
            
            Return ONLY valid JSON. No markdown.`
        }
    ];

    let userContent = `Filename: ${filename}\nFile Type: ${fileType}\nUser Notes: ${userPrompt}`;
    
    // If it's an image, we can try to inspect it (if the API supports it, 
    // but for now we'll rely on text to keep it fast and robust or user text input)
    // If user provided a specific description, use it.

    messages.push({
        role: "user",
        content: userContent
    });

    try {
        const completion = await websim.chat.completions.create({
            messages: messages,
            json: true
        });

        const metadata = JSON.parse(completion.content);

        return {
            ...metadata,
            assetType: assetType, // 'model' or 'texture'
            fileType: fileType,
            originalName: filename,
            url: url
        };
    } catch (e) {
        console.error("AI Metadata generation failed", e);
        // Fallback
        return {
            title: filename.split('.')[0],
            category: 'Other',
            description: 'A user uploaded asset.',
            tags: ['upload'],
            placementType: 'floor',
            assetType: assetType,
            fileType: fileType,
            originalName: filename,
            url: url
        };
    }
}

