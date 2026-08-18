// ==========================================================
// ETAT GLOBAL
// ==========================================================

let currentVideo = null;
let currentJobId = null;
let pollingTimer = null;


// ==========================================================
// ELEMENTS HTML
// ==========================================================

const serverStatus =
    document.getElementById("serverStatus");

const videoUrl =
    document.getElementById("videoUrl");

const analyseButton =
    document.getElementById("analyseButton");

const errorBox =
    document.getElementById("errorBox");

const videoResult =
    document.getElementById("videoResult");

const thumbnail =
    document.getElementById("thumbnail");

const videoTitle =
    document.getElementById("videoTitle");

const videoChannel =
    document.getElementById("videoChannel");

const videoDuration =
    document.getElementById("videoDuration");

const audioOptions =
    document.getElementById("audioOptions");

const videoOptions =
    document.getElementById("videoOptions");

const audioQuality =
    document.getElementById("audioQuality");

const videoQuality =
    document.getElementById("videoQuality");

const estimatedSize =
    document.getElementById("estimatedSize");

const downloadButton =
    document.getElementById("downloadButton");

const progressContainer =
    document.getElementById("progressContainer");

const progressStatus =
    document.getElementById("progressStatus");

const progressPercent =
    document.getElementById("progressPercent");

const progressBar =
    document.getElementById("progressBar");

const sizeProgress =
    document.getElementById("sizeProgress");

const speedProgress =
    document.getElementById("speedProgress");

const etaProgress =
    document.getElementById("etaProgress");

const progressMessage =
    document.getElementById("progressMessage");


// ==========================================================
// ERREURS
// ==========================================================

function showError(message) {

    errorBox.textContent =
        message || "Une erreur est survenue.";

    errorBox.style.display =
        "block";
}


function hideError() {

    errorBox.textContent = "";

    errorBox.style.display =
        "none";
}


// ==========================================================
// FORMAT DES OCTETS
// ==========================================================

function formatBytes(bytes) {

    const value = Number(bytes);

    if (!value || value <= 0) {
        return "--";
    }

    const units = [
        "B",
        "KB",
        "MB",
        "GB"
    ];

    let size = value;
    let index = 0;

    while (
        size >= 1024 &&
        index < units.length - 1
    ) {

        size /= 1024;
        index++;
    }

    if (index === 0) {

        return (
            Math.round(size) +
            " " +
            units[index]
        );
    }

    return (
        size.toFixed(1) +
        " " +
        units[index]
    );
}


// ==========================================================
// FORMAT DU TEMPS RESTANT
// ==========================================================

function formatEta(seconds) {

    if (
        seconds === null ||
        seconds === undefined ||
        Number.isNaN(Number(seconds))
    ) {
        return "--";
    }

    seconds =
        Math.max(
            0,
            Math.round(Number(seconds))
        );

    if (seconds < 60) {

        return (
            seconds +
            " s"
        );
    }

    const minutes =
        Math.floor(seconds / 60);

    const remainingSeconds =
        seconds % 60;

    return (
        minutes +
        " min " +
        remainingSeconds +
        " s"
    );
}


// ==========================================================
// FORMAT SELECTIONNE
// ==========================================================

function getSelectedFormat() {

    const selected =
        document.querySelector(
            'input[name="format"]:checked'
        );

    if (!selected) {
        return "mp3";
    }

    return selected.value;
}


// ==========================================================
// CHANGEMENT MP3 / MP4
// ==========================================================

function updateFormatUI() {

    const format =
        getSelectedFormat();

    if (format === "mp3") {

        audioOptions.classList.remove(
            "hidden"
        );

        videoOptions.classList.add(
            "hidden"
        );

    } else {

        audioOptions.classList.add(
            "hidden"
        );

        videoOptions.classList.remove(
            "hidden"
        );
    }

    updateEstimatedSize();
}


// ==========================================================
// TAILLE ESTIMEE
// ==========================================================

function updateEstimatedSize() {

    const format =
        getSelectedFormat();

    let option = null;

    if (
        format === "mp3" &&
        audioQuality.options.length > 0
    ) {

        option =
            audioQuality.options[
                audioQuality.selectedIndex
            ];

    } else if (
        format === "mp4" &&
        videoQuality.options.length > 0
    ) {

        option =
            videoQuality.options[
                videoQuality.selectedIndex
            ];
    }

    if (!option) {

        estimatedSize.textContent =
            "Taille inconnue";

        return;
    }

    estimatedSize.textContent =
        option.dataset.sizeLabel ||
        "Taille inconnue";
}


// ==========================================================
// AFFICHER LES INFOS VIDEO
// ==========================================================

function renderVideo(video) {

    currentVideo = video;

    thumbnail.src =
        video.thumbnail || "";

    videoTitle.textContent =
        video.title || "Titre inconnu";

    videoChannel.textContent =
        video.uploader || "Chaîne inconnue";

    videoDuration.textContent =
        video.duration || "--";


    // ======================================================
    // QUALITES AUDIO
    // ======================================================

    audioQuality.innerHTML = "";

    const audioLabels = {

        "128":
            "128 kbps — Standard",

        "192":
            "192 kbps — Bonne qualité",

        "256":
            "256 kbps — Haute qualité",

        "320":
            "320 kbps — Maximum"
    };


    const bitrates = [
        "128",
        "192",
        "256",
        "320"
    ];


    for (const bitrate of bitrates) {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            bitrate;

        option.textContent =
            audioLabels[bitrate];

        const sizeInfo =
            video.audio_sizes
                ? video.audio_sizes[bitrate]
                : null;

        option.dataset.sizeLabel =
            sizeInfo
                ? sizeInfo.label
                : "Taille inconnue";

        if (bitrate === "192") {

            option.selected =
                true;
        }

        audioQuality.appendChild(
            option
        );
    }


    // ======================================================
    // QUALITES VIDEO
    // ======================================================

    videoQuality.innerHTML = "";

    const qualities =
        video.video_qualities || [];


    for (const quality of qualities) {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            quality.value;

        option.textContent =
            quality.label;

        option.dataset.sizeLabel =
            quality.size_label ||
            "Taille inconnue";

        videoQuality.appendChild(
            option
        );
    }


    if (qualities.length === 0) {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            "720";

        option.textContent =
            "Aucune qualité détectée";

        option.dataset.sizeLabel =
            "Taille inconnue";

        videoQuality.appendChild(
            option
        );
    }


    videoResult.style.display =
        "block";

    updateFormatUI();
}


// ==========================================================
// VERIFIER LE BACKEND
// ==========================================================

async function checkServer() {

    serverStatus.textContent =
        "● Vérification du backend...";

    serverStatus.className =
        "server checking";

    try {

        const response =
            await chrome.runtime.sendMessage({

                type: "health"

            });


        if (
            response &&
            response.success
        ) {

            serverStatus.textContent =
                "● Backend connecté";

            serverStatus.className =
                "server online";

            return true;
        }

        throw new Error(
            response?.error ||
            "Backend inaccessible."
        );

    } catch (error) {

        serverStatus.textContent =
            "● Backend hors ligne";

        serverStatus.className =
            "server offline";

        return false;
    }
}


// ==========================================================
// RECUPERER AUTOMATIQUEMENT L'URL DE L'ONGLET
// ==========================================================

async function getCurrentTabUrl() {

    try {

        const tabs =
            await chrome.tabs.query({

                active: true,
                currentWindow: true

            });

        if (
            !tabs ||
            tabs.length === 0
        ) {
            return;
        }

        const tab =
            tabs[0];

        if (!tab.url) {
            return;
        }

        const url =
            tab.url;


        const isYouTube =

            url.includes(
                "youtube.com/watch"
            ) ||

            url.includes(
                "youtu.be/"
            ) ||

            url.includes(
                "youtube.com/shorts/"
            );


        if (isYouTube) {

            videoUrl.value =
                url;
        }

    } catch (error) {

        console.log(
            "Impossible de récupérer l'URL :",
            error
        );
    }
}


// ==========================================================
// ANALYSER UNE VIDEO
// ==========================================================

async function analyzeVideo() {

    hideError();

    const url =
        videoUrl.value.trim();


    if (!url) {

        showError(
            "Entre un lien YouTube."
        );

        return;
    }


    analyseButton.disabled =
        true;

    analyseButton.textContent =
        "Analyse...";


    try {

        const serverOnline =
            await checkServer();

        if (!serverOnline) {

            throw new Error(
                "Le backend Python n'est pas lancé. Lance app.py dans VS Code."
            );
        }


        const response =
            await chrome.runtime.sendMessage({

                type:
                    "analyze",

                url:
                    url

            });


        if (
            !response ||
            !response.success
        ) {

            throw new Error(

                response?.error ||
                "Impossible d'analyser la vidéo."

            );
        }


        renderVideo(
            response.video
        );


        await chrome.storage.local.set({

            videoData:
                response.video,

            videoUrl:
                url

        });


    } catch (error) {

        showError(
            error.message
        );

    } finally {

        analyseButton.disabled =
            false;

        analyseButton.textContent =
            "Analyser";
    }
}


// ==========================================================
// AFFICHER LA PROGRESSION
// ==========================================================

function updateProgress(data) {

    progressContainer.style.display =
        "block";

    const percent =
        Math.max(
            0,
            Math.min(
                100,
                Number(data.progress || 0)
            )
        );


    progressBar.style.width =
        percent + "%";

    progressPercent.textContent =
        Math.round(percent) + "%";


    if (
        data.status ===
        "downloading"
    ) {

        progressStatus.textContent =
            "Téléchargement";

    } else if (
        data.status ===
        "processing"
    ) {

        progressStatus.textContent =
            "Traitement";

    } else if (
        data.status ===
        "ready"
    ) {

        progressStatus.textContent =
            "Terminé";

    } else if (
        data.status ===
        "error"
    ) {

        progressStatus.textContent =
            "Erreur";

    } else {

        progressStatus.textContent =
            "Préparation";
    }


    const downloaded =
        formatBytes(
            data.downloaded_bytes
        );

    const total =
        formatBytes(
            data.total_bytes
        );


    sizeProgress.textContent =
        downloaded +
        " / " +
        total;


    if (data.speed) {

        speedProgress.textContent =
            formatBytes(
                data.speed
            ) +
            "/s";

    } else {

        speedProgress.textContent =
            "--";
    }


    etaProgress.textContent =
        "ETA " +
        formatEta(
            data.eta
        );


    progressMessage.textContent =
        data.message || "";
}


// ==========================================================
// SUIVRE LE JOB
// ==========================================================

async function pollJob(jobId) {

    if (pollingTimer) {

        clearTimeout(
            pollingTimer
        );
    }


    try {

        const response =
            await chrome.runtime.sendMessage({

                type:
                    "progress",

                jobId:
                    jobId

            });


        if (
            !response ||
            !response.success
        ) {

            throw new Error(

                response?.error ||
                "Impossible de récupérer la progression."

            );
        }


        updateProgress(
            response
        );


        // ==================================================
        // ERREUR
        // ==================================================

        if (
            response.status ===
            "error"
        ) {

            showError(

                response.error ||
                "Le téléchargement a échoué."

            );

            downloadButton.disabled =
                false;

            downloadButton.textContent =
                "Réessayer";


            await chrome.storage.local.set({

                currentJobId:
                    null,

                browserDownloadStarted:
                    false

            });

            currentJobId =
                null;

            return;
        }


        // ==================================================
        // FICHIER PRET
        // ==================================================

        if (
            response.status ===
            "ready"
        ) {

            progressStatus.textContent =
                "Terminé";

            progressPercent.textContent =
                "100%";

            progressBar.style.width =
                "100%";

            progressMessage.textContent =
                "Fichier prêt. Envoi vers Chrome...";


            const stored =
                await chrome.storage.local.get(
                    "browserDownloadStarted"
                );


            if (
                !stored.browserDownloadStarted
            ) {

                await chrome.storage.local.set({

                    browserDownloadStarted:
                        true

                });


                const downloadResponse =
                    await chrome.runtime.sendMessage({

                        type:
                            "downloadFile",

                        jobId:
                            jobId

                    });


                if (
                    !downloadResponse ||
                    !downloadResponse.success
                ) {

                    await chrome.storage.local.set({

                        browserDownloadStarted:
                            false

                    });


                    throw new Error(

                        downloadResponse?.error ||
                        "Impossible d'envoyer le fichier vers Chrome."

                    );
                }
            }


            progressMessage.textContent =
                "Téléchargement envoyé au navigateur.";


            downloadButton.disabled =
                false;

            downloadButton.textContent =
                "Télécharger de nouveau";

            return;
        }


        // ==================================================
        // CONTINUER LE POLLING
        // ==================================================

        pollingTimer =
            setTimeout(

                () => {

                    pollJob(
                        jobId
                    );

                },

                700

            );


    } catch (error) {

        showError(
            error.message
        );

        downloadButton.disabled =
            false;

        downloadButton.textContent =
            "Réessayer";
    }
}


// ==========================================================
// COMMENCER LE TELECHARGEMENT
// ==========================================================

async function startDownload() {

    hideError();


    if (!currentVideo) {

        showError(
            "Analyse d'abord une vidéo."
        );

        return;
    }


    const format =
        getSelectedFormat();


    let quality;


    if (format === "mp3") {

        quality =
            audioQuality.value;

    } else {

        quality =
            videoQuality.value;
    }


    if (!quality) {

        showError(
            "Aucune qualité disponible."
        );

        return;
    }


    const serverOnline =
        await checkServer();


    if (!serverOnline) {

        showError(
            "Le backend Python est hors ligne. Lance app.py."
        );

        return;
    }


    downloadButton.disabled =
        true;

    downloadButton.textContent =
        "Préparation...";


    progressContainer.style.display =
        "block";

    progressBar.style.width =
        "0%";

    progressPercent.textContent =
        "0%";

    progressStatus.textContent =
        "Préparation";

    sizeProgress.textContent =
        "-- / --";

    speedProgress.textContent =
        "--";

    etaProgress.textContent =
        "ETA --";

    progressMessage.textContent =
        "Démarrage du téléchargement...";


    try {

        const response =
            await chrome.runtime.sendMessage({

                type:
                    "startDownload",

                url:
                    currentVideo.url,

                formatType:
                    format,

                quality:
                    quality

            });


        if (
            !response ||
            !response.success
        ) {

            throw new Error(

                response?.error ||
                "Impossible de démarrer le téléchargement."

            );
        }


        currentJobId =
            response.job_id;


        await chrome.storage.local.set({

            currentJobId:
                currentJobId,

            browserDownloadStarted:
                false

        });


        downloadButton.textContent =
            "Téléchargement...";


        pollJob(
            currentJobId
        );


    } catch (error) {

        showError(
            error.message
        );

        downloadButton.disabled =
            false;

        downloadButton.textContent =
            "Réessayer";
    }
}


// ==========================================================
// RESTAURER L'ETAT DE L'EXTENSION
// ==========================================================

async function restoreState() {

    try {

        const stored =
            await chrome.storage.local.get([

                "videoData",
                "videoUrl",
                "currentJobId"

            ]);


        // On restaure la vidéo seulement
        // si elle correspond à l'URL actuellement affichée.

        if (
            stored.videoData &&
            stored.videoUrl &&
            (
                !videoUrl.value ||
                videoUrl.value ===
                    stored.videoUrl
            )
        ) {

            if (!videoUrl.value) {

                videoUrl.value =
                    stored.videoUrl;
            }

            renderVideo(
                stored.videoData
            );
        }


        if (
            stored.currentJobId
        ) {

            currentJobId =
                stored.currentJobId;

            downloadButton.disabled =
                true;

            downloadButton.textContent =
                "Téléchargement...";

            progressContainer.style.display =
                "block";

            pollJob(
                currentJobId
            );
        }

    } catch (error) {

        console.log(
            "Erreur restauration :",
            error
        );
    }
}


// ==========================================================
// EVENEMENTS MP3 / MP4
// ==========================================================

document
    .querySelectorAll(
        'input[name="format"]'
    )
    .forEach((radio) => {

        radio.addEventListener(

            "change",

            updateFormatUI

        );

    });


// ==========================================================
// CHANGEMENT QUALITE
// ==========================================================

audioQuality.addEventListener(

    "change",

    updateEstimatedSize

);


videoQuality.addEventListener(

    "change",

    updateEstimatedSize

);


// ==========================================================
// BOUTON ANALYSER
// ==========================================================

analyseButton.addEventListener(

    "click",

    analyzeVideo

);


// ==========================================================
// TOUCHE ENTREE
// ==========================================================

videoUrl.addEventListener(

    "keydown",

    (event) => {

        if (
            event.key === "Enter"
        ) {

            event.preventDefault();

            analyzeVideo();
        }
    }

);


// ==========================================================
// BOUTON TELECHARGER
// ==========================================================

downloadButton.addEventListener(

    "click",

    startDownload

);


// ==========================================================
// INITIALISATION
// ==========================================================

async function initialize() {

    // 1. Vérifier Flask

    await checkServer();


    // 2. Récupérer automatiquement
    // l'URL de l'onglet YouTube actuel

    await getCurrentTabUrl();


    // 3. Restaurer les informations
    // d'un téléchargement déjà en cours

    await restoreState();
}


initialize();