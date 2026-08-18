from flask import Flask, render_template, request, jsonify, send_file
from pathlib import Path
from urllib.parse import urlparse

import os
import yt_dlp
import threading
import shutil
import time
import uuid
import re


app = Flask(__name__)


# ============================================================
# DOSSIERS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

DOWNLOAD_FOLDER = BASE_DIR / "downloads"
DOWNLOAD_FOLDER.mkdir(exist_ok=True)


# ============================================================
# JOBS
# ============================================================

JOBS = {}
JOBS_LOCK = threading.Lock()


# ============================================================
# OUTILS
# ============================================================

ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*m")


def clean_text(text):

    text = str(text)

    return ANSI_ESCAPE.sub(
        "",
        text
    ).strip()


def format_duration(seconds):

    if not seconds:
        return "Inconnue"

    seconds = int(seconds)

    minutes, seconds = divmod(
        seconds,
        60
    )

    hours, minutes = divmod(
        minutes,
        60
    )

    if hours:

        return (
            f"{hours}:"
            f"{minutes:02d}:"
            f"{seconds:02d}"
        )

    return (
        f"{minutes}:"
        f"{seconds:02d}"
    )


def format_size(size):

    if not size:
        return "Taille inconnue"

    size = float(size)

    units = [
        "B",
        "KB",
        "MB",
        "GB"
    ]

    index = 0

    while (
        size >= 1024
        and
        index < len(units) - 1
    ):

        size /= 1024
        index += 1

    if index == 0:

        return (
            f"{size:.0f} "
            f"{units[index]}"
        )

    return (
        f"{size:.1f} "
        f"{units[index]}"
    )


def get_quality_name(height):

    names = {

        4320: "8K",
        2160: "4K",
        1440: "2K",
        1080: "Full HD",
        720: "HD",
        480: "SD",
        360: "SD",
        240: "Low",
        144: "Low"

    }

    return names.get(
        height,
        "Vidéo"
    )


def valid_youtube_url(url):

    try:

        parsed = urlparse(url)

        host = (
            parsed.hostname
            or ""
        ).lower()

        allowed = {

            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
            "music.youtube.com",
            "youtu.be",
            "www.youtu.be",
            "youtube-nocookie.com",
            "www.youtube-nocookie.com"

        }

        return (
            host in allowed
            or
            host.endswith(
                ".youtube.com"
            )
        )

    except Exception:

        return False


# ============================================================
# ESTIMATION TAILLE
# ============================================================

def estimate_format_bytes(
    format_info,
    duration
):

    size = (

        format_info.get("filesize")

        or

        format_info.get(
            "filesize_approx"
        )

    )

    if size:
        return int(size)

    bitrate = (

        format_info.get("tbr")

        or

        format_info.get("vbr")

        or

        format_info.get("abr")

    )

    if bitrate and duration:

        try:

            return int(

                float(bitrate)
                *
                1000
                /
                8
                *
                duration

            )

        except Exception:
            pass

    return None


def estimate_video_size(
    formats,
    height,
    duration
):

    videos = [

        f

        for f in formats

        if (
            f.get("height") == height
            and
            f.get("vcodec") != "none"
        )

    ]

    audios = [

        f

        for f in formats

        if (
            f.get("vcodec") == "none"
            and
            f.get("acodec") != "none"
        )

    ]

    video_format = None
    audio_format = None


    if videos:

        video_format = max(

            videos,

            key=lambda f:
                f.get("tbr")
                or
                0

        )


    if audios:

        audio_format = max(

            audios,

            key=lambda f:
                f.get("abr")
                or
                f.get("tbr")
                or
                0

        )


    total = 0
    known = False


    if video_format:

        size = estimate_format_bytes(

            video_format,

            duration

        )

        if size:

            total += size
            known = True


    if audio_format:

        size = estimate_format_bytes(

            audio_format,

            duration

        )

        if size:

            total += size
            known = True


    return total if known else None


def estimate_mp3_size(
    duration,
    bitrate
):

    if not duration:
        return None

    return int(

        duration
        *
        int(bitrate)
        *
        1000
        /
        8

    )


# ============================================================
# ANALYSE VIDEO
# ============================================================

def analyse_video(url):

    if not valid_youtube_url(url):

        raise ValueError(
            "Lien YouTube invalide."
        )


    options = {

        "quiet": True,

        "skip_download": True,

        "noplaylist": True,

        "socket_timeout": 30

    }


    with yt_dlp.YoutubeDL(
        options
    ) as ydl:

        info = ydl.extract_info(

            url,

            download=False

        )


    formats = info.get(
        "formats",
        []
    )

    duration = info.get(
        "duration"
    )


    # --------------------------------------------------------
    # QUALITES VIDEO
    # --------------------------------------------------------

    heights = sorted(

        {

            f.get("height")

            for f in formats

            if (
                f.get("height")
                and
                f.get("vcodec") != "none"
            )

        },

        reverse=True

    )


    video_qualities = []


    for height in heights:

        estimated = estimate_video_size(

            formats,

            height,

            duration

        )


        video_qualities.append({

            "value":
                height,

            "label":
                (
                    f"{height}p — "
                    f"{get_quality_name(height)}"
                ),

            "size":
                estimated or 0,

            "size_label":
                format_size(
                    estimated
                )

        })


    # --------------------------------------------------------
    # QUALITES AUDIO
    # --------------------------------------------------------

    audio_sizes = {}


    for bitrate in [

        128,
        192,
        256,
        320

    ]:

        estimated = estimate_mp3_size(

            duration,

            bitrate

        )


        audio_sizes[
            str(bitrate)
        ] = {

            "size":
                estimated or 0,

            "label":
                format_size(
                    estimated
                )

        }


    return {

        "url":
            url,

        "title":
            info.get(
                "title",
                "Titre inconnu"
            ),

        "thumbnail":
            info.get(
                "thumbnail"
            ),

        "duration":
            format_duration(
                duration
            ),

        "uploader":
            info.get(
                "uploader",
                "Chaîne inconnue"
            ),

        "video_qualities":
            video_qualities,

        "audio_sizes":
            audio_sizes

    }


# ============================================================
# JOB HELPERS
# ============================================================

def create_job(
    format_type
):

    job_id = uuid.uuid4().hex


    with JOBS_LOCK:

        JOBS[job_id] = {

            "status":
                "starting",

            "progress":
                0,

            "message":
                "Préparation...",

            "downloaded_bytes":
                0,

            "total_bytes":
                0,

            "speed":
                0,

            "eta":
                None,

            "filename":
                None,

            "file_path":
                None,

            "file_size":
                0,

            "error":
                None,

            "stage_index":
                0,

            "expected_stages":
                (
                    2
                    if format_type == "mp4"
                    else 1
                ),

            "created_at":
                time.time()

        }


    return job_id


def get_job(job_id):

    with JOBS_LOCK:

        job = JOBS.get(
            job_id
        )

        if not job:
            return None

        return dict(job)


def update_job(
    job_id,
    **values
):

    with JOBS_LOCK:

        if job_id in JOBS:

            JOBS[
                job_id
            ].update(values)


# ============================================================
# PROGRESS
# ============================================================

def create_progress_hook(
    job_id
):

    def hook(data):

        status = data.get(
            "status"
        )

        job = get_job(
            job_id
        )

        if not job:
            return


        if status == "downloading":

            downloaded = (
                data.get(
                    "downloaded_bytes"
                )
                or
                0
            )

            total = (

                data.get(
                    "total_bytes"
                )

                or

                data.get(
                    "total_bytes_estimate"
                )

                or

                0

            )

            speed = (
                data.get("speed")
                or
                0
            )

            eta = data.get(
                "eta"
            )


            raw_percent = (

                downloaded / total

                if total

                else 0

            )


            expected = max(

                job.get(
                    "expected_stages",
                    1
                ),

                1

            )


            stage = min(

                job.get(
                    "stage_index",
                    0
                ),

                expected - 1

            )


            stage_size = (
                90
                /
                expected
            )


            percent = (

                stage
                *
                stage_size

                +

                raw_percent
                *
                stage_size

            )


            update_job(

                job_id,

                status=
                    "downloading",

                progress=
                    round(
                        min(
                            percent,
                            90
                        ),
                        1
                    ),

                downloaded_bytes=
                    downloaded,

                total_bytes=
                    total,

                speed=
                    speed,

                eta=
                    eta,

                message=
                    "Téléchargement en cours..."

            )


        elif status == "finished":

            stage = (

                job.get(
                    "stage_index",
                    0
                )

                +

                1

            )


            update_job(

                job_id,

                stage_index=
                    stage,

                status=
                    "processing",

                progress=
                    90,

                message=
                    "Traitement avec FFmpeg..."

            )


    return hook


# ============================================================
# POST PROCESSOR
# ============================================================

def create_post_hook(
    job_id
):

    def hook(data):

        status = data.get(
            "status"
        )


        if status in [
            "started",
            "processing"
        ]:

            update_job(

                job_id,

                status=
                    "processing",

                progress=
                    95,

                message=
                    "Fusion / conversion FFmpeg..."

            )


        elif status == "finished":

            update_job(

                job_id,

                status=
                    "processing",

                progress=
                    98,

                message=
                    "Finalisation..."

            )


    return hook


# ============================================================
# LOGGER
# ============================================================

class JobLogger:

    def debug(self, message):
        pass

    def info(self, message):
        pass

    def warning(self, message):
        pass

    def error(self, message):
        pass


# ============================================================
# ERREURS
# ============================================================

def friendly_error(error):

    text = clean_text(
        error
    )

    lower = text.lower()


    if "403" in lower:

        return (
            "Erreur HTTP 403. "
            "Vérifie yt-dlp et Deno."
        )


    if (
        "requested format is not available"
        in lower
    ):

        return (
            "Cette qualité n'est plus disponible."
        )


    if "private video" in lower:

        return (
            "Cette vidéo est privée."
        )


    if "video unavailable" in lower:

        return (
            "Cette vidéo est indisponible."
        )


    if "sign in" in lower:

        return (
            "Cette vidéo nécessite une authentification."
        )


    if len(text) > 500:

        text = (
            text[:500]
            +
            "..."
        )


    return text


# ============================================================
# WORKER
# ============================================================

def download_worker(
    job_id,
    url,
    format_type,
    quality
):

    job_folder = (

        DOWNLOAD_FOLDER
        /
        job_id

    )

    job_folder.mkdir(

        parents=True,

        exist_ok=True

    )


    try:

        template = str(

            job_folder
            /
            "%(title).150B [%(id)s].%(ext)s"

        )


        common = {

            "outtmpl":
                template,

            "noplaylist":
                True,

            "quiet":
                True,

            "progress_hooks": [

                create_progress_hook(
                    job_id
                )

            ],

            "postprocessor_hooks": [

                create_post_hook(
                    job_id
                )

            ],

            "logger":
                JobLogger(),

            "retries":
                5,

            "fragment_retries":
                5,

            "socket_timeout":
                30

        }


        # ----------------------------------------------------
        # MP3
        # ----------------------------------------------------

        if format_type == "mp3":

            bitrate = str(
                quality
            )

            if bitrate not in {

                "128",
                "192",
                "256",
                "320"

            }:

                bitrate = "192"


            options = {

                **common,

                "format":
                    "bestaudio/best",

                "postprocessors": [

                    {

                        "key":
                            "FFmpegExtractAudio",

                        "preferredcodec":
                            "mp3",

                        "preferredquality":
                            bitrate

                    }

                ]

            }


            extension = ".mp3"


        # ----------------------------------------------------
        # MP4
        # ----------------------------------------------------

        elif format_type == "mp4":

            try:

                height = int(
                    quality
                )

            except Exception:

                height = 720


            options = {

                **common,

                "format":

                    (
                        f"bestvideo[height<={height}][ext=mp4]"
                        "+"
                        "bestaudio[ext=m4a]"
                        "/"
                        f"best[height<={height}][ext=mp4]"
                        "/"
                        f"bestvideo[height<={height}]"
                        "+"
                        "bestaudio"
                        "/"
                        f"best[height<={height}]"
                    ),

                "merge_output_format":
                    "mp4"

            }


            extension = ".mp4"


        else:

            raise ValueError(
                "Format invalide."
            )


        update_job(

            job_id,

            status=
                "downloading",

            message=
                "Connexion..."

        )


        with yt_dlp.YoutubeDL(
            options
        ) as ydl:

            ydl.extract_info(

                url,

                download=True

            )


        update_job(

            job_id,

            progress=
                99,

            status=
                "processing",

            message=
                "Préparation du fichier..."

        )


        files = [

            file

            for file
            in job_folder.iterdir()

            if (
                file.is_file()
                and
                file.suffix.lower()
                ==
                extension
            )

        ]


        if not files:

            raise FileNotFoundError(
                "Fichier final introuvable."
            )


        final_file = max(

            files,

            key=lambda file:
                file.stat().st_mtime

        )


        final_size = (
            final_file
            .stat()
            .st_size
        )


        update_job(

            job_id,

            status=
                "ready",

            progress=
                100,

            message=
                "Fichier prêt.",

            filename=
                final_file.name,

            file_path=
                str(final_file),

            file_size=
                final_size,

            downloaded_bytes=
                final_size,

            total_bytes=
                final_size,

            speed=
                0,

            eta=
                0

        )


        # Nettoyage de sécurité après 6 heures
        timer = threading.Timer(

            21600,

            cleanup_job,

            args=(
                job_id,
            )

        )

        timer.daemon = True

        timer.start()


    except Exception as error:

        update_job(

            job_id,

            status=
                "error",

            error=
                friendly_error(
                    error
                ),

            message=
                "Erreur."

        )


# ============================================================
# CLEANUP
# ============================================================

def cleanup_job(job_id):

    job = get_job(
        job_id
    )


    if job:

        path = job.get(
            "file_path"
        )


        if path:

            folder = Path(
                path
            ).parent


            if folder.exists():

                shutil.rmtree(

                    folder,

                    ignore_errors=True

                )


    with JOBS_LOCK:

        JOBS.pop(
            job_id,
            None
        )


# ============================================================
# PAGE WEB EXISTANTE
# ============================================================

@app.route(
    "/",
    methods=[
        "GET",
        "POST"
    ]
)
def home():

    video = None
    error = None


    if request.method == "POST":

        url = request.form.get(
            "url",
            ""
        ).strip()


        try:

            video = analyse_video(
                url
            )

        except Exception as e:

            error = friendly_error(
                e
            )


    return render_template(

        "index.html",

        video=video,

        error=error

    )


# ============================================================
# API HEALTH
# ============================================================

@app.get(
    "/api/health"
)
def api_health():

    return jsonify({

        "success":
            True,

        "message":
            "Backend connecté"

    })


# ============================================================
# API ANALYSE
# ============================================================

@app.post(
    "/api/analyze"
)
def api_analyze():

    data = request.get_json(
        silent=True
    ) or {}


    url = str(

        data.get(
            "url",
            ""
        )

    ).strip()


    try:

        video = analyse_video(
            url
        )


        return jsonify({

            "success":
                True,

            "video":
                video

        })


    except Exception as e:

        return jsonify({

            "success":
                False,

            "error":
                friendly_error(
                    e
                )

        }), 400


# ============================================================
# CREATION JOB
# ============================================================

def start_job(
    url,
    format_type,
    quality
):

    if not valid_youtube_url(
        url
    ):

        raise ValueError(
            "Lien YouTube invalide."
        )


    if format_type not in [
        "mp3",
        "mp4"
    ]:

        raise ValueError(
            "Format invalide."
        )


    job_id = create_job(
        format_type
    )


    thread = threading.Thread(

        target=
            download_worker,

        args=(

            job_id,

            url,

            format_type,

            quality

        ),

        daemon=True

    )


    thread.start()


    return job_id


# ============================================================
# WEB START DOWNLOAD
# ============================================================

@app.post(
    "/start-download"
)
def start_download():

    url = request.form.get(
        "url",
        ""
    ).strip()


    format_type = request.form.get(
        "format_type",
        ""
    )


    if format_type == "mp3":

        quality = request.form.get(
            "audio_quality",
            "192"
        )

    else:

        quality = request.form.get(
            "video_quality",
            "720"
        )


    try:

        job_id = start_job(

            url,

            format_type,

            quality

        )


        return jsonify({

            "success":
                True,

            "job_id":
                job_id

        })


    except Exception as e:

        return jsonify({

            "success":
                False,

            "error":
                friendly_error(
                    e
                )

        }), 400


# ============================================================
# EXTENSION START DOWNLOAD
# ============================================================

@app.post(
    "/api/start-download"
)
def api_start_download():

    data = request.get_json(
        silent=True
    ) or {}


    url = str(

        data.get(
            "url",
            ""
        )

    ).strip()


    format_type = str(

        data.get(
            "format_type",
            ""
        )

    ).strip()


    quality = str(

        data.get(
            "quality",
            ""
        )

    ).strip()


    try:

        job_id = start_job(

            url,

            format_type,

            quality

        )


        return jsonify({

            "success":
                True,

            "job_id":
                job_id

        })


    except Exception as e:

        return jsonify({

            "success":
                False,

            "error":
                friendly_error(
                    e
                )

        }), 400


# ============================================================
# PROGRESSION WEB + EXTENSION
# ============================================================

@app.get(
    "/progress/<job_id>"
)
@app.get(
    "/api/progress/<job_id>"
)
def progress(job_id):

    job = get_job(
        job_id
    )


    if not job:

        return jsonify({

            "success":
                False,

            "status":
                "error",

            "error":
                "Téléchargement introuvable."

        }), 404


    return jsonify({

        "success":
            True,

        "status":
            job.get(
                "status"
            ),

        "progress":
            job.get(
                "progress",
                0
            ),

        "message":
            job.get(
                "message",
                ""
            ),

        "downloaded_bytes":
            job.get(
                "downloaded_bytes",
                0
            ),

        "total_bytes":
            job.get(
                "total_bytes",
                0
            ),

        "speed":
            job.get(
                "speed",
                0
            ),

        "eta":
            job.get(
                "eta"
            ),

        "filename":
            job.get(
                "filename"
            ),

        "file_size":
            job.get(
                "file_size",
                0
            ),

        "error":
            job.get(
                "error"
            )

    })


# ============================================================
# FICHIER FINAL
# ============================================================

@app.get(
    "/download-file/<job_id>"
)
def download_file(job_id):

    job = get_job(
        job_id
    )


    if not job:

        return (
            "Fichier introuvable.",
            404
        )


    if job.get(
        "status"
    ) != "ready":

        return (
            "Fichier pas encore prêt.",
            409
        )


    path = Path(

        job.get(
            "file_path",
            ""
        )

    )


    if not path.exists():

        return (
            "Fichier introuvable.",
            404
        )


    return send_file(

        path,

        as_attachment=True,

        download_name=
            job.get(
                "filename"
            )

    )


# ============================================================
# CLEANUP API
# ============================================================

@app.post(
    "/api/cleanup/<job_id>"
)
def api_cleanup(job_id):

    cleanup_job(
        job_id
    )


    return jsonify({

        "success":
            True

    })


# ============================================================
# START
# ============================================================

if __name__ == "__main__":

    port = int(
        os.environ.get(
            "PORT",
            5000
        )
    )

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False,
        threaded=True,
        use_reloader=False
    )