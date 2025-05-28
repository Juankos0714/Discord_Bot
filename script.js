async function sendToAllAIs() {
    const inputText = document.getElementById('inputText').value;
    const responseContainer = document.getElementById('responseContainer');
    const loader = document.getElementById('loader');

    if (!inputText.trim()) {
        responseContainer.innerHTML = "<div style='text-align: center; color: #666;'>Por favor, ingresa algún texto.</div>";
        return;
    }

    responseContainer.innerHTML = ""; 
    loader.style.display = 'block'; 

    try {
        const response = await fetch('/api/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ inputText })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error en el servidor');
        }

        const data = await response.json();
        displayResponses(data.gemini, data.cohere, data.mistral, data.discord, responseContainer);
    } catch (error) {
        console.error("Error en las solicitudes:", error);
        responseContainer.innerHTML = `<div style='text-align: center; color: red;'>Error: ${error.message}</div>`;
    } finally {
        loader.style.display = 'none'; 
    }
}

async function sendDirectToDiscord() {
    const inputText = document.getElementById('inputText').value;
    const responseContainer = document.getElementById('responseContainer');
    const loader = document.getElementById('loader');

    if (!inputText.trim()) {
        responseContainer.innerHTML = "<div style='text-align: center; color: #666;'>Por favor, ingresa algún texto.</div>";
        return;
    }

    loader.style.display = 'block';

    try {
        const response = await fetch('/api/discord', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: inputText })
        });

        const data = await response.json();

        if (data.success) {
            responseContainer.innerHTML = `
                <div style='text-align: center; color: green; padding: 20px; border: 2px solid #4CAF50; border-radius: 8px; background-color: #f0f8f0;'>
                    <h3>🚀 ¡MENSAJE ENVIADO A DISCORD!</h3>
                    <p>${data.message}</p>
                </div>
            `;
        } else {
            responseContainer.innerHTML = `
                <div style='text-align: center; color: red; padding: 20px; border: 2px solid #f44336; border-radius: 8px; background-color: #fdf0f0;'>
                    <h3>❌ Error al enviar a Discord</h3>
                    <p>${data.error}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error("Error:", error);
        responseContainer.innerHTML = `
            <div style='text-align: center; color: red; padding: 20px; border: 2px solid #f44336; border-radius: 8px; background-color: #fdf0f0;'>
                <h3>❌ Error de conexión</h3>
                <p>No se pudo conectar con el servidor: ${error.message}</p>
            </div>
        `;
    } finally {
        loader.style.display = 'none';
    }
}

function displayResponses(geminiResponse, cohereResponse, mistralResponse, discordStatus, container) {
    let discordSection = '';
    
    if (discordStatus) {
        const statusColor = discordStatus.sent ? '#4CAF50' : '#f44336';
        const bgColor = discordStatus.sent ? '#f0f8f0' : '#fdf0f0';
        
        discordSection = `
            <div style='text-align: center; color: ${statusColor}; padding: 15px; border: 2px solid ${statusColor}; border-radius: 8px; background-color: ${bgColor}; margin-bottom: 20px;'>
                <h3>🤖 Estado de Discord</h3>
                <p><strong>${discordStatus.message}</strong></p>
            </div>
        `;
    }

    container.innerHTML = `
        ${discordSection}
        
        <div class="response-box gemini">
            <h3>🔷 Respuesta de Gemini</h3>
            <div>${geminiResponse.success ? geminiResponse.text.replace(/\n/g, '<br>') : `<span style="color: red;">${geminiResponse.error}</span>`}</div>
        </div>
        
        <div class="response-box cohere">
            <h3>🟠 Respuesta de Cohere</h3>
            <div>${cohereResponse.success ? cohereResponse.text.replace(/\n/g, '<br>') : `<span style="color: red;">${cohereResponse.error}</span>`}</div>
        </div>
        
        <div class="response-box mistral">
            <h3>🟣 Respuesta de Mistral</h3>
            <div>${mistralResponse.success ? mistralResponse.text.replace(/\n/g, '<br>') : `<span style="color: red;">${mistralResponse.error}</span>`}</div>
        </div>
    `;
}