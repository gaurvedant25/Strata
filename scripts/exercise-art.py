"""
Builds the exercise thumbnails the pickers show beside each name.

    python scripts/exercise-art.py

A one-off, run by hand when the library gains a lift, like `icons.mjs`. Its
output is committed, so nobody needs Python to build or run the app — this is
the only thing here that is not pure Node, because resizing a picture is the
one job the repo has no tool for.

Four sources, tried in this order
---------------------------------
1. `art-source/`, where licensed artwork goes. Drop a file named after the
   exercise's slug — `art-source/barbell-bench-press.png`, the same slug the
   built thumbnail carries — and it wins over everything below. This is the
   path for a set bought outright, such as ExerciseDB's commercial licence, at
   whatever resolution the purchase allows. Files here keep their colour, are
   composited onto the card grey if they arrive transparent, and an animation
   is read at its halfway frame. The folder is gitignored: a bought licence
   covers using the processed thumbnails inside this app, not republishing the
   originals.

2. ExerciseDB (https://github.com/ExerciseDB/exercisedb-api), whose free
   set is 1,500 exercises, each a 180×180 animated GIF of a grey figure with
   the worked muscle in red. The picture is the GIF's halfway frame, saved as
   a PNG exactly as it is delivered — same size, same white ground, same
   colours — because that picture is the one that was asked for. This is
   where 96 of the 97 thumbnails come from, and the credit is on the Image
   credits page, which ships inside the app and is linked from Settings.
   ExerciseDB's own terms put that free set under non-commercial use with
   attribution; commercial use is its paid licence, which goes in through
   path 1.

3. `everkinetic/data` (CC BY-SA 4.0), which draws each lift as a figure with
   its equipment on nothing. Inverted to white line work, a drawing sits in
   this interface the way the app's own hand-drawn icons do. Kept as the
   fallback that owes nobody a permission.

4. `free-exercise-db` (Unlicense, public domain), which photographs a lifter
   performing each one. It covers the rowing machine, which is the one lift in
   this library that none of the sets above draws.

Whatever the source, every picture is downloaded once, made square, and
committed as a file this app serves itself. Nothing is fetched
from a third party at runtime, and the whole set fits inside the offline
bundle, which is the point: the one room this app is used in is the one with no
signal.

Colour
------
ExerciseDB's pictures keep theirs, because the red over the working muscle is
the reason that set was asked for. The drawings and the photographs do not:
they are white line work and grey photography respectively, so that the two
colours the app reserves — the danger red and the streak's ember — still mean
something.

The names on the left of each map are this library's; the ones on the right
are the source's, chosen by hand. Automatic matching is not good enough here —
ExerciseDB calls a pec deck a "lever seated fly" and a bicycle crunch an "air
bike", and a thumbnail showing the wrong lift is worse than no thumbnail.
"""

import io
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "exercise"
# Licensed artwork, handed to this script rather than fetched by it.
LOCAL = ROOT / "art-source"
LOCAL_EXTS = ("png", "webp", "jpg", "jpeg", "gif")

# Where ExerciseDB serves each exercise's GIF, by its id. Its API pages the
# index a hundred at a time and rate-limits hard, so the ids are written into
# the map below rather than looked up on every run.
EXERCISEDB_MEDIA = "https://static.exercisedb.dev/media"
ART_RAW = "https://raw.githubusercontent.com/everkinetic/data/master"
ART_INDEX = f"{ART_RAW}/exercises.json"
PHOTO_RAW = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main"
PHOTO_INDEX = f"{PHOTO_RAW}/dist/exercises.json"

# The row shows a 56px thumbnail, and 168 is what that needs on a
# three-times-density phone screen. ExerciseDB's pictures are not scaled to
# it: they arrive at 180, which is already enough, and are kept as they are.
SIZE = 168

# A photograph is a wide shot of a whole gym with a person somewhere in the
# middle of it, and the whole frame leaves the person a few pixels tall. Keep
# this share of the short side, from slightly above centre: where the crop has
# to lose something, feet are worth less than a head and a barbell.
ZOOM = 0.70
TOP_BIAS = 0.38

# A drawing is line work with a wide white margin. Trimmed to the ink, then
# given this much of the square back as breathing room.
ART_PAD = 0.06
# The floor a drawing is laid on once inverted, so the tile reads as a surface
# on the black ground rather than as a hole in it. `--color-card`.
ART_FLOOR = 18
# How hard the antialiased greys left by the resize are pushed toward white.
# Below 1 brightens the midtones; the lines were the midtones.
ART_GAMMA = 0.72

# Which moment of an ExerciseDB animation is the picture. Halfway is the
# contracted half of the rep, which is the half worth showing.
EXERCISEDB_FRAME = 0.5

# This library's name -> the exercise's id in ExerciseDB, with that set's own
# name for it alongside. Chosen by hand against its 1,500 entries: the names
# there are equipment-first ("lever seated fly" is a pec deck, "air bike" is a
# bicycle crunch), so nothing here could be matched automatically without
# putting the wrong lift beside a name.
EXERCISEDB = {
    # Chest
    "Barbell Bench Press": "EIeI8Vf",  # barbell bench press
    "Cable Fly": "Pr9Rhf4",  # cable standing fly
    "Dip": "9WTm7dq",  # chest dip
    "Dumbbell Bench Press": "SpYC0Kp",  # dumbbell bench press
    "Dumbbell Fly": "yz9nUhF",  # dumbbell fly
    "Incline Barbell Bench Press": "3TZduzM",  # barbell incline bench press
    "Incline Dumbbell Press": "ns0SIbU",  # dumbbell incline bench press
    "Machine Chest Press": "T0yTjgW",  # lever chest press
    "Pec Deck": "v3xmPAR",  # lever seated fly
    "Push-up": "I4hDWkc",  # push-up
    # Back
    "Back Extension": "rUXfn3R",  # lever back extension
    "Barbell Row": "eZyBC3j",  # barbell bent over row
    "Barbell Shrug": "dG7tG5y",  # barbell shrug
    "Chin-up": "T2mxWqc",  # chin-up
    "Close-Grip Lat Pulldown": "rkg41Fb",  # twin handle parallel grip lat pulldown
    "Deadlift": "ila4NZS",  # barbell deadlift
    "Dumbbell Shrug": "NJzBsGJ",  # dumbbell shrug
    "Good Morning": "XlZ4lAC",  # barbell good morning
    "Inverted Row": "bZGHsAZ",  # inverted row
    "Lat Pulldown": "RVwzP10",  # cable pulldown
    "One-Arm Dumbbell Row": "BJ0Hz5L",  # dumbbell bent over row
    "Pull-up": "lBDjFxJ",  # pull-up
    "Seated Cable Row": "fUBheHs",  # cable seated row
    "Straight-Arm Pulldown": "x69MAlq",  # cable straight arm pulldown
    "Sumo Deadlift": "KgI0tqW",  # barbell sumo deadlift
    "T-Bar Row": "aaXr7ld",  # lever t bar row
    # Shoulders
    "Arnold Press": "Xy4jlWA",  # dumbbell arnold press
    "Cable Lateral Raise": "goJ6ezq",  # cable lateral raise
    "Dumbbell Lateral Raise": "DsgkuIt",  # dumbbell lateral raise
    "Dumbbell Shoulder Press": "znQUdHY",  # dumbbell seated shoulder press
    # A rope pulled to the face, standing, for the rear delts: a face pull
    # under the name that set files it by.
    "Face Pull": "ZfyAGhK",  # cable standing rear delt row (with rope)
    "Front Raise": "3eGE2JC",  # dumbbell front raise
    "Machine Shoulder Press": "67n3r98",  # lever shoulder press
    "Overhead Press": "kTbSH9h",  # barbell seated overhead press
    "Push Press": "FS63wTN",  # dumbbell push press
    "Rear Delt Fly": "mu5Guxt",  # dumbbell rear delt raise
    "Reverse Pec Deck": "myfUsKf",  # lever seated reverse fly
    "Upright Row": "UDlhcO8",  # barbell upright row
    # Arms
    "Barbell Curl": "25GPyDY",  # barbell curl
    "Bench Dip": "RrLske5",  # bench dip (knees bent)
    "Cable Curl": "G08RZcQ",  # cable curl
    "Close-Grip Bench Press": "J6Dx1Mu",  # barbell close-grip bench press
    "Concentration Curl": "gvsWLQw",  # dumbbell concentration curl
    "Dumbbell Curl": "NbVPDMW",  # dumbbell biceps curl
    "EZ-Bar Curl": "6TG6x2w",  # ez barbell curl
    "Hammer Curl": "slDvUAU",  # dumbbell hammer curl
    "Overhead Triceps Extension": "dZl9Q27",  # barbell standing overhead triceps extension
    "Preacher Curl": "qOgPVf6",  # barbell preacher curl
    "Rope Pushdown": "dU605di",  # cable pushdown (with rope attachment)
    "Skull Crusher": "h8LFzo9",  # barbell lying triceps extension skull crusher
    "Triceps Kickback": "W6PxUkg",  # dumbbell kickback
    "Triceps Pushdown": "3ZflifB",  # cable pushdown
    "Wrist Curl": "82LxxkW",  # barbell wrist curl
    # Legs
    "Back Squat": "qXTaZnJ",  # barbell full squat
    "Box Jump": "iPm26QU",  # box jump down with one leg stabilization
    "Front Squat": "zG0zs85",  # barbell front squat
    "Goblet Squat": "yn8yg1r",  # dumbbell goblet squat
    "Hack Squat": "Qa55kX1",  # sled hack squat
    "Leg Curl": "17lJ1kr",  # lever lying leg curl
    "Leg Extension": "my33uHU",  # lever leg extension
    # The stray Cyrillic в is in ExerciseDB's own name for this one, which
    # was double-encoded somewhere upstream; it is only a comment here.
    "Leg Press": "10Z2DXU",  # sled 45в° leg press
    "Reverse Lunge": "VaP75jl",  # barbell rear lunge
    "Romanian Deadlift": "wQ2c4XD",  # barbell romanian deadlift
    "Seated Calf Raise": "bOOdeyc",  # lever seated calf raise
    "Split Squat": "9E25EOx",  # split squats
    "Standing Calf Raise": "ykUOVze",  # lever standing calf raise
    "Step-up": "aXtJhlg",  # dumbbell step-up
    "Walking Lunge": "IZVHb27",  # walking lunge
    # Glutes
    "Cable Glute Kickback": "HEJ6DIX",  # cable kickback
    "Cable Pull-Through": "OM46QHm",  # cable pull through (with rope)
    "Glute Bridge": "u0cNiij",  # low glute bridge on floor
    "Hip Thrust": "qKBpF7I",  # barbell glute bridge
    # Core
    "Ab Wheel Rollout": "NAgVB3t",  # wheel rollerout
    "Bicycle Crunch": "1ZFqTDN",  # air bike
    "Cable Crunch": "WW95auq",  # cable kneeling crunch
    "Cable Woodchop": "aVs3BR3",  # cable twist
    "Crunch": "kjJ3VoQ",  # crunch (hands overhead)
    "Dead Bug": "iny3m5y",  # dead bug
    "Hanging Leg Raise": "I3tsCnC",  # hanging leg raise
    "Mountain Climber": "RJgzwny",  # mountain climber
    "Plank": "VBAWRPG",  # weighted front plank
    "Russian Twist": "XVDdcoj",  # russian twist
    "Sit-up": "Bn6TXyO",  # sit-up v. 2
    # Cardio. No rowing machine anywhere in ExerciseDB's free set (the only
    # erg in it is a ski erg), which is why the photograph below is still
    # doing one job.
    "Elliptical": "rjtuP6X",  # walk elliptical cross trainer
    "Jump Rope": "e1e76I2",  # jump rope
    "Stair Climber": "j9Q5crt",  # walking on stepmill
    "Stationary Bike": "a8VDgLw",  # stationary bike walk
    "Treadmill Run": "y5p0H8a",  # run (equipment)
    "Walking": "rjiM4L3",  # walking on incline treadmill
    # Other
    "Clean and Jerk": "SGY8Zui",  # barbell clean and press
    "Farmer's Carry": "qPEzJjA",  # farmers walk
    "Kettlebell Swing": "UHJlbu3",  # kettlebell swing
    "Power Clean": "SiWCcTN",  # power clean
    "Snatch": "xHKN2s8",  # barbell one arm snatch
    "Thruster": "f7Y9eDZ",  # barbell thruster
    "Turkish Get-up": "Ha7SZ3y",  # kettlebell turkish get up (squat style)
}

# This library's name -> (the drawing in everkinetic/data, which half of the
# movement). Only true matches: anything this set does not really have falls
# through to a photograph below.
ART = {
    # Chest
    "Barbell Bench Press": ("Bench Press", "tension"),
    "Cable Fly": ("Cable Crossover", "tension"),
    "Dip": ("Chest Dips", "tension"),
    "Dumbbell Bench Press": ("Bench Press Dumbbell", "tension"),
    "Dumbbell Fly": ("Dumbbell Flys", "relaxation"),
    "Incline Barbell Bench Press": ("Incline Bench Press", "tension"),
    "Incline Dumbbell Press": ("Incline Dumbbell Press", "tension"),
    "Machine Chest Press": ("Machine Bench Press", "tension"),
    "Pec Deck": ("Butterfly Machine", "tension"),
    "Push-up": ("Push Ups", "tension"),
    # Back
    "Back Extension": ("Hyperextensions", "tension"),
    # The plain bent-over row is the one entry in this set with no artwork at
    # all; the reverse-grip drawing is the same movement, and a grip is not
    # something a 48px thumbnail was ever going to show.
    "Barbell Row": ("Reverse Grips Bent Over Barbell Rows", "tension"),
    "Barbell Shrug": ("Barbell Shrugs", "tension"),
    "Chin-up": ("Chin Ups", "tension"),
    "Close-Grip Lat Pulldown": ("V Bar Pull Down", "tension"),
    "Deadlift": ("Barbell Dead Lifts", "tension"),
    "Good Morning": ("Barbell Good Mornings", "tension"),
    "Inverted Row": ("Body Row", "tension"),
    "Lat Pulldown": ("Wide Grip Lat Pull Down", "tension"),
    "Pull-up": ("Pull Ups", "tension"),
    "Seated Cable Row": ("Seated Cable Rows", "tension"),
    "Straight-Arm Pulldown": ("Straight Arm Push Down", "tension"),
    "T-Bar Row": ("T-Bar Rows", "tension"),
    # Shoulders
    "Arnold Press": ("Arnold Press", "tension"),
    "Dumbbell Lateral Raise": ("Lateral Dumbbell Raises", "tension"),
    "Dumbbell Shoulder Press": ("Dumbbell Shoulder Press", "tension"),
    "Front Raise": ("Front Raises", "tension"),
    "Machine Shoulder Press": ("Seated Shoulder Press Machine", "tension"),
    "Overhead Press": ("Seated Military Press", "tension"),
    "Rear Delt Fly": (
        "Bent Over Rear Deltoid Raise With Head On Bench",
        "tension",
    ),
    "Upright Row": ("Upright Barbell Rows", "tension"),
    # Arms
    "Barbell Curl": ("Biceps Curls with Barbell", "tension"),
    "Bench Dip": ("Bench Dips", "tension"),
    "Cable Curl": ("Standing Biceps Curl with Cable", "tension"),
    "Close-Grip Bench Press": ("Close Grip Barbell Bench Press", "tension"),
    "Concentration Curl": ("Concentration Curls with Dumbbell", "tension"),
    "Dumbbell Curl": ("Biceps Curl with Dumbbell", "tension"),
    "EZ-Bar Curl": ("EZ Bar Curl with Barbell", "tension"),
    "Hammer Curl": ("Biceps Hammer Curl with Dumbbell", "tension"),
    "Overhead Triceps Extension": (
        "Standing Overhead Triceps Extension with Barbell",
        "tension",
    ),
    "Preacher Curl": ("Preacher Curl with Barbell", "tension"),
    "Rope Pushdown": ("Triceps Pushdown with Rope and Cable", "tension"),
    "Skull Crusher": ("Lying Triceps Press with Barbell", "tension"),
    "Triceps Kickback": ("Triceps Kickback with Dumbbell", "tension"),
    "Triceps Pushdown": ("Triceps Pushdown with Cable", "tension"),
    # Legs
    "Back Squat": ("Barbell Squat", "tension"),
    "Front Squat": ("Front Squat with Barbell", "tension"),
    "Goblet Squat": ("Squats using Dumbbells", "tension"),
    "Hack Squat": ("Hack Squat Machine", "tension"),
    "Leg Curl": ("Lying Leg Curl Machine", "tension"),
    "Leg Extension": ("Leg Extensions", "tension"),
    "Leg Press": ("Leg Press", "tension"),
    "Reverse Lunge": ("Rear Lunges with Barbell", "tension"),
    "Romanian Deadlift": ("Romanian Dead Lift", "tension"),
    "Seated Calf Raise": ("Seated Calf Raise using Machine", "tension"),
    "Split Squat": ("Single Leg Squat with Barbell", "tension"),
    "Standing Calf Raise": ("Standing Calf Raises using Machine", "tension"),
    "Step-up": ("Step Ups with Dumbbells", "tension"),
    "Walking Lunge": ("Walking Lunges", "tension"),
    # Glutes
    "Cable Glute Kickback": ("One Legged Cable Kickback", "tension"),
    "Glute Bridge": ("Bridging", "tension"),
    # Core
    "Ab Wheel Rollout": ("Ab Rollout on Knees with Barbell", "tension"),
    "Bicycle Crunch": ("Air Bike", "tension"),
    "Cable Crunch": ("Seated Ab Crunch with Cable", "tension"),
    "Crunch": ("Crunches", "tension"),
}

# The rest of the library, photographed. Every cardio machine and every
# barbell-on-the-floor lift is here, because the drawings do not go there.
PHOTO = {
    # Back
    "Dumbbell Shrug": "Dumbbell Shrug",
    "One-Arm Dumbbell Row": "One-Arm Dumbbell Row",
    "Sumo Deadlift": "Sumo Deadlift",
    # Shoulders
    "Cable Lateral Raise": "Cable Seated Lateral Raise",
    "Face Pull": "Face Pull",
    "Push Press": "Push Press",
    "Reverse Pec Deck": "Reverse Machine Flyes",
    # Arms
    "Wrist Curl": "Seated Palm-Up Barbell Wrist Curl",
    # Legs
    "Box Jump": "Front Box Jump",
    # Glutes
    "Cable Pull-Through": "Pull Through",
    "Hip Thrust": "Barbell Hip Thrust",
    # Core
    "Cable Woodchop": "Standing Cable Wood Chop",
    "Dead Bug": "Dead Bug",
    "Hanging Leg Raise": "Hanging Leg Raise",
    "Mountain Climber": "Mountain Climbers",
    "Plank": "Plank",
    "Russian Twist": "Russian Twist",
    "Sit-up": "Sit-Up",
    # Cardio
    "Elliptical": "Elliptical Trainer",
    "Jump Rope": "Rope Jumping",
    "Rowing Machine": "Rowing, Stationary",
    "Stair Climber": "Stairmaster",
    "Stationary Bike": "Bicycling, Stationary",
    "Treadmill Run": "Running, Treadmill",
    "Walking": "Walking, Treadmill",
    # Other
    "Clean and Jerk": "Clean and Jerk",
    "Farmer's Carry": "Farmer's Walk",
    "Kettlebell Swing": "One-Arm Kettlebell Swings",
    "Power Clean": "Power Clean",
    "Snatch": "Snatch",
    "Thruster": "Kettlebell Thruster",
    "Turkish Get-up": "Kettlebell Turkish Get-Up (Lunge style)",
}

# Which of a photographed exercise's frames to use. They are ordered start
# position first, which is usually where the equipment is clearest; these few
# read better at the top of the movement.
FRAME = {
    "Cable Lateral Raise": 1,
    "Dumbbell Shrug": 1,
    "Face Pull": 1,
    "Hanging Leg Raise": 1,
    "Hip Thrust": 1,
    "One-Arm Dumbbell Row": 1,
    "Sit-up": 1,
}


def slug(name: str) -> str:
    """The same slug `seedId` in src/lib/seed.ts derives, minus its prefix."""
    plain = "".join(
        ch if ch.isascii() and ch.isalnum() else "-" for ch in name.lower()
    )
    return "-".join(part for part in plain.split("-") if part)


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "gym-log/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def fetch_first(urls: list[str]) -> bytes:
    """The first of these that exists. Raises the last error if none do."""
    for i, url in enumerate(urls):
        try:
            return fetch(url)
        except urllib.error.HTTPError:
            if i == len(urls) - 1:
                raise
    raise urllib.error.URLError("no urls given")


def art_urls(entry: dict, half: str) -> list[str]:
    """
    Where a drawing might live, best first.

    Most of them are in `dist/png`, built and numbered — but a few dozen
    exercises were never built into that folder and exist only as the source
    artwork the site used, which is the same drawing at a larger size. The
    built pair is named for the half of the movement; the source pair is
    numbered, with the second frame being the contracted one.
    """
    urls = [f"{ART_RAW}/dist/png/{entry['id_num']}-{half}.png"]
    web = entry.get("img") or []
    wanted = 1 if half == "tension" else 0
    if len(web) > wanted:
        name = web[wanted].rsplit("/", 1)[-1]
        urls.append(f"{ART_RAW}/src/images-web/{name}")
    return urls


def png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def licensed(path: Path) -> bytes:
    """
    Artwork from `art-source/`: colour kept, trimmed, squared.

    The one renderer here that does not discard colour, because colour is the
    reason a set like this is bought — the orange over the muscle being worked
    is the whole point of the picture, and greyscaling it would throw away the
    thing that was paid for.

    A transparent PNG is composited onto the card grey rather than left to the
    browser, so the tile has no edge inside itself, and the trim reads the
    corner pixel as the background rather than assuming white: these arrive on
    white, on nothing, and occasionally on a light grey.
    """
    image = Image.open(path)
    if getattr(image, "n_frames", 1) > 1:
        image.seek(image.n_frames // 2)
    image = image.convert("RGBA")
    floor = Image.new("RGBA", image.size, (ART_FLOOR, ART_FLOOR, ART_FLOOR, 255))
    image = Image.alpha_composite(floor, image).convert("RGB")

    flat = image.convert("L")
    ground = Image.new("L", flat.size, flat.getpixel((0, 0)))
    box = ImageChops.difference(flat, ground).getbbox()
    if box:
        image = image.crop(box)
    side = int(max(image.size) * (1 + ART_PAD * 2))
    square = Image.new("RGB", (side, side), (ART_FLOOR, ART_FLOOR, ART_FLOOR))
    square.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return png(square.resize((SIZE, SIZE), Image.LANCZOS))


def exercisedb(raw: bytes) -> bytes:
    """
    An ExerciseDB picture: the animation's halfway frame, untouched.

    No trim, no resize, no recolouring. The frame goes into the PNG exactly as
    drawn — every edge as sharp as the GIF had it — and the white it stands on
    stays white, because that is how ExerciseDB shows it and that is what was
    asked for.
    """
    animation = Image.open(io.BytesIO(raw))
    frames = getattr(animation, "n_frames", 1)
    if frames > 1:
        animation.seek(int(frames * EXERCISEDB_FRAME))
    frame = animation.convert("RGB")
    # A GIF frame has at most 256 colours, so a palette holds it exactly and
    # the file is a fraction of the size. The whole folder is precached for
    # offline use, which is what makes the size matter.
    colors = frame.getcolors(256)
    if colors is not None:
        # Mapped by hand rather than through `quantize`, which matches colours
        # approximately and shifts them by a few levels.
        index = {rgb: i for i, (_, rgb) in enumerate(colors)}
        indexed = Image.new("P", frame.size)
        indexed.putpalette([channel for _, rgb in colors for channel in rgb])
        indexed.putdata([index[rgb] for rgb in frame.getdata()])
        frame = indexed
    return png(frame)


def photo(raw: bytes) -> bytes:
    """Square, cropped in on the lifter, greyscale."""
    image = Image.open(io.BytesIO(raw))
    side = int(min(image.size) * ZOOM)
    left = (image.width - side) // 2
    top = int((image.height - side) * TOP_BIAS)
    square = image.crop((left, top, left + side, top + side))
    return png(square.resize((SIZE, SIZE), Image.LANCZOS).convert("L"))


def drawing(raw: bytes) -> bytes:
    """
    The same square, from a line drawing: trimmed, squared, inverted.

    Trimming to the ink and squaring on the longer side is what makes a tall
    standing figure and a wide leg press machine take up the same share of the
    tile. Inverting turns ink on paper into the white line work everything else
    in the app is drawn in.
    """
    image = Image.open(io.BytesIO(raw)).convert("L")
    ink = ImageOps.invert(image).getbbox()
    if ink:
        image = image.crop(ink)
    # Thickened before it is scaled down, by an amount that depends on how far
    # it has to fall. These drawings are a two-pixel line on an image up to
    # 960px tall; scaled straight to 144 that line lands on a third of a pixel
    # and comes out as grey suggestion rather than white line. Growing the ink
    # first is what survives the resize.
    longest = max(image.size)
    grow = 3 if longest <= 400 else 5 if longest <= 800 else 7
    image = image.filter(ImageFilter.MinFilter(grow))
    side = int(max(image.size) * (1 + ART_PAD * 2))
    square = Image.new("L", (side, side), 255)
    square.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    square = ImageOps.invert(square.resize((SIZE, SIZE), Image.LANCZOS))
    # Then the greys the resize left behind are pulled toward white, so a line
    # reads as a line. The ground under the figure comes up off pure black to
    # the colour of a card, and nothing else about the tone is touched.
    square = square.point(lambda v: min(255, int(255 * (v / 255) ** ART_GAMMA)))
    return png(square.point(lambda v: max(v, ART_FLOOR)))


def main() -> int:
    # A Windows console still defaults to a codepage that cannot print half of
    # these source names, and the script should not die reporting its own
    # progress.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    art_index = {e["title"]: e for e in json.loads(fetch(ART_INDEX).decode("utf8"))}
    photo_index = {
        e["name"]: e for e in json.loads(fetch(PHOTO_INDEX).decode("utf8"))
    }

    # A name that has drifted out of its source would silently cost a lift its
    # picture, so every map is checked before anything is written.
    unknown = [t for t, _ in ART.values() if t not in art_index]
    unknown += [n for n in PHOTO.values() if n not in photo_index]
    overlap = sorted(set(ART) & set(PHOTO))
    if unknown:
        print("not found in source: " + ", ".join(unknown), file=sys.stderr)
        return 1
    if overlap:
        print("in both maps: " + ", ".join(overlap), file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    given = 0
    failed = []
    for name in sorted(set(EXERCISEDB) | set(ART) | set(PHOTO)):
        # Anything handed to the script wins, whatever the maps below say.
        mine = next(
            (
                candidate
                for ext in LOCAL_EXTS
                if (candidate := LOCAL / f"{slug(name)}.{ext}").exists()
            ),
            None,
        )
        if mine:
            try:
                data = licensed(mine)
            except OSError as error:
                failed.append(f"{name}: {mine.name}: {error}")
                continue
            written = OUT / f"{slug(name)}.png"
            written.write_bytes(data)
            total += len(data)
            given += 1
            print(f"  {written.name:32} {len(data) / 1024:5.1f} KB  yours  {mine.name}")
            continue
        if name in EXERCISEDB:
            key = EXERCISEDB[name]
            urls = [f"{EXERCISEDB_MEDIA}/{key}.gif"]
            draw, source = exercisedb, f"edb    {key}"
        elif name in ART:
            title, half = ART[name]
            urls = art_urls(art_index[title], half)
            draw, source = drawing, f"drawn  {title}"
        else:
            images = photo_index[PHOTO[name]].get("images") or []
            if not images:
                failed.append(f"{name}: {PHOTO[name]} has no photo")
                continue
            frame = images[min(FRAME.get(name, 0), len(images) - 1)]
            urls = [f"{PHOTO_RAW}/exercises/{frame}"]
            draw, source = photo, f"photo  {PHOTO[name]}"
        try:
            data = draw(fetch_first(urls))
        except (urllib.error.URLError, OSError) as error:
            failed.append(f"{name}: {error}")
            continue
        path = OUT / f"{slug(name)}.png"
        path.write_bytes(data)
        total += len(data)
        print(f"  {path.name:32} {len(data) / 1024:5.1f} KB  {source}")

    kept = len(set(EXERCISEDB) | set(ART) | set(PHOTO)) - len(failed)
    print(
        f"\n{kept} thumbnails, {total / 1024:.0f} KB total"
        + (f" — {given} from art-source/" if given else "")
    )
    for line in failed:
        print("FAILED " + line, file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
