const API_BASE = "http://127.0.0.1:5000";


// ==========================================================
// APPEL AU BACKEND FLASK
// ==========================================================

async function apiFetch(path, options = {}) {

    const response = await fetch(
        API_BASE + path,
        options
    );

    const text = await response.text();

    let data;

    try {

        data = JSON.parse(text);

    } catch {

        data = {
            success: false,
            error: text || "Réponse invalide du serveur."
        };

    }

    if (!response.ok) {

        throw new Error(
            data.error || "Erreur serveur."
        );

    }

    return data;
}


// ==========================================================
// MESSAGES REÇUS DE popup.js
// ==========================================================

chrome.runtime.onMessage.addListener(
    (
        message,
        sender,
        sendResponse
    ) => {

        handleMessage(message)
            .then(sendResponse)
            .catch((error) => {

                sendResponse({
                    success: false,
                    error: error.message
                });

            });

        return true;
    }
);


// ==========================================================
// TRAITEMENT DES COMMANDES
// ==========================================================

async function handleMessage(message) {

    // ------------------------------------------------------
    // TESTER SI FLASK EST CONNECTÉ
    // ------------------------------------------------------

    if (message.type === "health") {

        return await apiFetch(
            "/api/health"
        );
    }


    // ------------------------------------------------------
    // ANALYSER UNE VIDÉO
    // ------------------------------------------------------

    if (message.type === "analyze") {

        return await apiFetch(
            "/api/analyze",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    url: message.url
                })
            }
        );
    }


    // ------------------------------------------------------
    // COMMENCER LE TÉLÉCHARGEMENT
    // ------------------------------------------------------

    if (message.type === "startDownload") {

        return await apiFetch(
            "/api/start-download",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({

                    url: message.url,

                    format_type:
                        message.formatType,

                    quality:
                        message.quality

                })
            }
        );
    }


    // ------------------------------------------------------
    // RÉCUPÉRER LA PROGRESSION
    // ------------------------------------------------------

    if (message.type === "progress") {

        return await apiFetch(
            "/api/progress/"
            +
            encodeURIComponent(
                message.jobId
            )
        );
    }


    // ------------------------------------------------------
    // TÉLÉCHARGER LE FICHIER FINAL DANS CHROME
    // ------------------------------------------------------

    if (message.type === "downloadFile") {

        const downloadUrl =
            API_BASE
            +
            "/download-file/"
            +
            encodeURIComponent(
                message.jobId
            );


        const downloadId =
            await chrome.downloads.download({

                url: downloadUrl,

                saveAs: false

            });


        // Associer le téléchargement Chrome
        // au job Python

        const stored =
            await chrome.storage.local.get(
                "downloadJobs"
            );


        const downloadJobs =
            stored.downloadJobs || {};


        downloadJobs[
            String(downloadId)
        ] = message.jobId;


        await chrome.storage.local.set({

            downloadJobs:
                downloadJobs,

            browserDownloadStarted:
                true

        });


        return {

            success: true,

            downloadId:
                downloadId

        };
    }


    throw new Error(
        "Commande inconnue."
    );
}


// ==========================================================
// QUAND CHROME TERMINE LE TÉLÉCHARGEMENT
// ==========================================================

chrome.downloads.onChanged.addListener(
    async (delta) => {

        // On attend seulement un changement d'état

        if (!delta.state) {

            return;
        }


        const state =
            delta.state.current;


        if (
            state !== "complete"
            &&
            state !== "interrupted"
        ) {

            return;
        }


        const stored =
            await chrome.storage.local.get([
                "downloadJobs",
                "currentJobId"
            ]);


        const jobs =
            stored.downloadJobs || {};


        const jobId =
            jobs[
                String(delta.id)
            ];


        if (!jobId) {

            return;
        }


        // --------------------------------------------------
        // DEMANDER À FLASK DE NETTOYER
        // LES FICHIERS TEMPORAIRES
        // --------------------------------------------------

        try {

            await apiFetch(
                "/api/cleanup/"
                +
                encodeURIComponent(
                    jobId
                ),
                {
                    method: "POST"
                }
            );

        } catch (error) {

            console.error(
                "Erreur nettoyage :",
                error
            );

        }


        // --------------------------------------------------
        // NETTOYER LE STORAGE DE L'EXTENSION
        // --------------------------------------------------

        delete jobs[
            String(delta.id)
        ];


        const values = {

            downloadJobs:
                jobs,

            browserDownloadStarted:
                false,

            lastDownloadStatus:
                state

        };


        if (
            stored.currentJobId
            ===
            jobId
        ) {

            values.currentJobId =
                null;
        }


        await chrome.storage.local.set(
            values
        );
    }
);