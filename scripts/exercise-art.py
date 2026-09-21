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
   path for a set bought directly from Gym visual, at whatever resolution the
   purchase allows. Files here keep their colour, are composited onto the card
   grey if they arrive transparent, and an animation is read at its halfway
   frame. The folder is gitignored: a bought licence covers using the
   processed thumbnails inside this app, not republishing the originals.

2. `hasaneyldrm/exercises-dataset`, which carries 1,324 **Gym visual** renders
   — the grey figure with the worked muscle in red — and states that they are
   redistributed with the rights holder's separate written permission, on two
   conditions: 180×180 maximum, and the copyright indication kept with every
   use. Both are honoured here. The tile is 168px, under that cap, and the
   credit is on the Image credits page, which ships inside the app and is
   linked from Settings. This is where 96 of the 97 thumbnails come from. The
   media is Gym visual's property, and its terms are at
   https://gymvisual.com/content/3-terms-and-conditions-of-use — read them
   before shipping this to a store, and buy the set through path 1 if that is
   what they require of you.

3. `everkinetic/data` (CC BY-SA 4.0), which draws each lift as a figure with
   its equipment on nothing. Inverted to white line work, a drawing sits in
   this interface the way the app's own hand-drawn icons do. Kept as the
   fallback that owes nobody a permission.

4. `free-exercise-db` (Unlicense, public domain), which photographs a lifter
   performing each one. It covers the rowing machine, which is the one lift in
   this library that none of the sets above draws.

Whatever the source, every picture is downloaded once, cropped square, scaled
to the tile, and committed as a file this app serves itself. Nothing is fetched
from a third party at runtime, and the whole set fits inside the offline
bundle, which is the point: the one room this app is used in is the one with no
signal.

Colour
------
The renders keep theirs, because the red over the working muscle is the reason
that set was asked for. The drawings and the photographs do not: they are white
line work and grey photography respectively, so that the two colours the app
reserves — the danger red and the streak's ember — still mean something.

The names on the left of each map are this library's; the names on the right
are the source's, chosen by hand. Automatic matching is not good enough here —
that set calls a pec deck a "lever seated fly" and a bicycle crunch an "air
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

MIRROR_RAW = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main"
MIRROR_INDEX = f"{MIRROR_RAW}/data/exercises.json"
ART_RAW = "https://raw.githubusercontent.com/everkinetic/data/master"
ART_INDEX = f"{ART_RAW}/exercises.json"
PHOTO_RAW = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main"
PHOTO_INDEX = f"{PHOTO_RAW}/dist/exercises.json"

# The row shows a 56px thumbnail, and 168 is what that needs on a
# three-times-density phone screen. It is also the largest this can be: the
# renders are used under a permission that caps them at 180.
SIZE = 168
QUALITY = 86

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

# What the Gym visual renders stand on. They arrive on white, which as
# ninety-odd bright squares would be the loudest thing on a black screen, so
# the white is knocked back to the card grey and the figure keeps its own
# shading and its red. Set this to "white" to leave them exactly as they came.
MIRROR_GROUND = "card"
# Anything at least this light counts as the white the render was put on.
MIRROR_WHITE = 238
# The permission this media is redistributed under caps it at 180×180, so the
# tile cannot grow past that however big the row gets.
MIRROR_MAX = 180
# A render is read out of the animation rather than off the still, and the
# still is why: it is an eight kilobyte JPEG of a line-drawn figure, which is
# the worst thing that format can be asked to hold — every edge arrives already
# softened and ringed. A GIF frame is palette-indexed and has none of that, so
# what gets scaled to the tile is the drawing rather than a photograph of the
# drawing. The halfway frame is the contracted half of the rep, which is the
# half worth showing.
#
# Both are 180px, and that is the ceiling: the same renders are published at
# 360 elsewhere, but only stamped with another site's logo across the corner of
# every frame, which is worse in a 56px tile than the softness it would fix.
# Sharp and bigger means buying the set — see path 1.
MIRROR_FRAME = 0.5
# A render is trimmed to its own edges, so it needs less breathing room than a
# drawing with a margin built into it; the tighter square spends more of the
# tile on the figure.
RENDER_PAD = 0.03

# This library's name -> the exercise in the Gym visual set.
#
# The renders that were asked for: a grey figure with the muscle it works
# picked out in red. Chosen by hand, one at a time, against 1,324 entries —
# the names in that set are equipment-first ("lever seated fly" is a pec deck,
# "air bike" is a bicycle crunch), so nothing here could be matched
# automatically without putting the wrong lift beside a name.
MIRROR = {
    # Chest
    "Barbell Bench Press": "barbell bench press",
    "Cable Fly": "cable standing fly",
    "Dip": "chest dip",
    "Dumbbell Bench Press": "dumbbell bench press",
    "Dumbbell Fly": "dumbbell fly",
    "Incline Barbell Bench Press": "barbell incline bench press",
    "Incline Dumbbell Press": "dumbbell incline bench press",
    "Machine Chest Press": "lever chest press",
    "Pec Deck": "lever seated fly",
    "Push-up": "push-up",
    # Back
    "Back Extension": "lever back extension",
    "Barbell Row": "barbell bent over row",
    "Barbell Shrug": "barbell shrug",
    "Chin-up": "chin-up",
    "Close-Grip Lat Pulldown": "twin handle parallel grip lat pulldown",
    "Deadlift": "barbell deadlift",
    "Dumbbell Shrug": "dumbbell shrug",
    "Good Morning": "barbell good morning",
    "Inverted Row": "inverted row",
    "Lat Pulldown": "cable pulldown",
    "One-Arm Dumbbell Row": "dumbbell bent over row",
    "Pull-up": "pull-up",
    "Seated Cable Row": "cable seated row",
    "Straight-Arm Pulldown": "cable straight arm pulldown",
    "Sumo Deadlift": "barbell sumo deadlift",
    "T-Bar Row": "lever t bar row",
    # Shoulders
    "Arnold Press": "dumbbell arnold press",
    "Cable Lateral Raise": "cable lateral raise",
    "Dumbbell Lateral Raise": "dumbbell lateral raise",
    "Dumbbell Shoulder Press": "dumbbell seated shoulder press",
    # A rope pulled to the face, standing, for the rear delts: a face pull
    # under the name that set files it by.
    "Face Pull": "cable standing rear delt row (with rope)",
    "Front Raise": "dumbbell front raise",
    "Machine Shoulder Press": "lever shoulder press",
    "Overhead Press": "barbell seated overhead press",
    "Push Press": "dumbbell push press",
    "Rear Delt Fly": "dumbbell rear delt raise",
    "Reverse Pec Deck": "lever seated reverse fly",
    "Upright Row": "barbell upright row",
    # Arms
    "Barbell Curl": "barbell curl",
    "Bench Dip": "bench dip (knees bent)",
    "Cable Curl": "cable curl",
    "Close-Grip Bench Press": "barbell close-grip bench press",
    "Concentration Curl": "dumbbell concentration curl",
    "Dumbbell Curl": "dumbbell biceps curl",
    "EZ-Bar Curl": "ez barbell curl",
    "Hammer Curl": "dumbbell hammer curl",
    "Overhead Triceps Extension": "barbell standing overhead triceps extension",
    "Preacher Curl": "barbell preacher curl",
    "Rope Pushdown": "cable pushdown (with rope attachment)",
    "Skull Crusher": "barbell lying triceps extension skull crusher",
    "Triceps Kickback": "dumbbell kickback",
    "Triceps Pushdown": "cable pushdown",
    "Wrist Curl": "barbell wrist curl",
    # Legs
    "Back Squat": "barbell full squat",
    "Box Jump": "box jump down with one leg stabilization",
    "Front Squat": "barbell front squat",
    "Goblet Squat": "dumbbell goblet squat",
    "Hack Squat": "sled hack squat",
    "Leg Curl": "lever lying leg curl",
    "Leg Extension": "lever leg extension",
    # Not a typo to tidy: that set's own name for this one is double-encoded,
    # and carries a stray Cyrillic в in front of the degree sign. Written as
    # escapes so it survives an editor, and matched exactly as it is stored.
    "Leg Press": "sled 45в° leg press",
    "Reverse Lunge": "barbell rear lunge",
    "Romanian Deadlift": "barbell romanian deadlift",
    "Seated Calf Raise": "lever seated calf raise",
    "Split Squat": "split squats",
    "Standing Calf Raise": "lever standing calf raise",
    "Step-up": "dumbbell step-up",
    "Walking Lunge": "walking lunge",
    # Glutes
    "Cable Glute Kickback": "cable kickback",
    "Cable Pull-Through": "cable pull through (with rope)",
    "Glute Bridge": "low glute bridge on floor",
    "Hip Thrust": "barbell glute bridge",
    # Core
    "Ab Wheel Rollout": "wheel rollerout",
    "Bicycle Crunch": "air bike",
    "Cable Crunch": "cable kneeling crunch",
    "Cable Woodchop": "cable twist",
    "Crunch": "crunch (hands overhead)",
    "Dead Bug": "dead bug",
    "Hanging Leg Raise": "hanging leg raise",
    "Mountain Climber": "mountain climber",
    "Plank": "weighted front plank",
    "Russian Twist": "russian twist",
    "Sit-up": "sit-up v. 2",
    # Cardio. No rowing machine anywhere in the set, which is why the
    # photograph below is still doing one job.
    "Elliptical": "walk elliptical cross trainer",
    "Jump Rope": "jump rope",
    "Stair Climber": "walking on stepmill",
    "Stationary Bike": "stationary bike walk",
    "Treadmill Run": "run (equipment)",
    "Walking": "walking on incline treadmill",
    # Other
    "Clean and Jerk": "barbell clean and press",
    "Farmer's Carry": "farmers walk",
    "Kettlebell Swing": "kettlebell swing",
    "Power Clean": "power clean",
    "Snatch": "barbell one arm snatch",
    "Thruster": "barbell thruster",
    "Turkish Get-up": "kettlebell turkish get up (squat style)",
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


def webp(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=QUALITY, method=6)
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
    return webp(square.resize((SIZE, SIZE), Image.LANCZOS))


def render(image: Image.Image, cap: int | None = None) -> bytes:
    """
    A Gym visual render: trimmed, squared, colour kept, white knocked back.

    Colour survives here and nowhere else in this file, because the colour is
    the point — the red over the muscle being worked is the whole reason this
    set was asked for, and greyscaling it would throw away the only thing it
    says that a line drawing does not.

    The white it arrives on does not survive. A tile of white on a black screen
    is brighter than anything else in the app including the numbers you are
    supposed to be reading, and ninety-odd of them down a scrolling list is a
    ladder of headlights. Knocking white back to the card grey leaves the
    figure's own shading and its red untouched, and the tile matches every
    other tile in the sheet.
    """
    image = image.convert("RGB")
    flat = image.convert("L")
    box = ImageChops.difference(flat, Image.new("L", flat.size, 255)).getbbox()
    if box:
        image = image.crop(box)
        flat = flat.crop(box)

    if MIRROR_GROUND == "card":
        floor = (ART_FLOOR, ART_FLOOR, ART_FLOOR)
        # A mask of everything that was the white ground, swapped for the card
        # grey in one pass rather than pixel by pixel.
        white = flat.point(lambda v: 255 if v >= MIRROR_WHITE else 0, mode="1")
        image = Image.composite(Image.new("RGB", image.size, floor), image, white)
    else:
        floor = (255, 255, 255)

    side = int(max(image.size) * (1 + RENDER_PAD * 2))
    square = Image.new("RGB", (side, side), floor)
    square.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    edge = min(SIZE, cap) if cap else SIZE
    tile = square.resize((edge, edge), Image.LANCZOS)
    # Line work loses its edges to any downscale, and gets them back from a
    # light unsharp pass. Light: enough to redraw a cable, not enough to put a
    # halo round the figure.
    tile = tile.filter(ImageFilter.UnsharpMask(radius=0.7, percent=70, threshold=3))
    return webp(tile)


def mirror(raw: bytes) -> bytes:
    """The render, read out of the animation at its halfway frame."""
    animation = Image.open(io.BytesIO(raw))
    frames = getattr(animation, "n_frames", 1)
    if frames > 1:
        animation.seek(int(frames * MIRROR_FRAME))
    return render(animation, MIRROR_MAX)


def photo(raw: bytes) -> bytes:
    """Square, cropped in on the lifter, greyscale."""
    image = Image.open(io.BytesIO(raw))
    side = int(min(image.size) * ZOOM)
    left = (image.width - side) // 2
    top = int((image.height - side) * TOP_BIAS)
    square = image.crop((left, top, left + side, top + side))
    return webp(square.resize((SIZE, SIZE), Image.LANCZOS).convert("L"))


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
    return webp(square.point(lambda v: max(v, ART_FLOOR)))


def main() -> int:
    # A Windows console still defaults to a codepage that cannot print half of
    # these source names, and the script should not die reporting its own
    # progress.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    loaded = json.loads(fetch(MIRROR_INDEX).decode("utf8"))
    mirror_index = {
        e["name"]: e
        for e in (loaded if isinstance(loaded, list) else loaded["exercises"])
    }
    art_index = {e["title"]: e for e in json.loads(fetch(ART_INDEX).decode("utf8"))}
    photo_index = {
        e["name"]: e for e in json.loads(fetch(PHOTO_INDEX).decode("utf8"))
    }

    # A name that has drifted out of its source would silently cost a lift its
    # picture, so every map is checked before anything is written.
    unknown = [n for n in MIRROR.values() if n not in mirror_index]
    unknown += [t for t, _ in ART.values() if t not in art_index]
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
    for name in sorted(set(MIRROR) | set(ART) | set(PHOTO)):
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
            written = OUT / f"{slug(name)}.webp"
            written.write_bytes(data)
            total += len(data)
            given += 1
            print(f"  {written.name:32} {len(data) / 1024:5.1f} KB  yours  {mine.name}")
            continue
        if name in MIRROR:
            title = MIRROR[name]
            entry = mirror_index[title]
            urls = [f"{MIRROR_RAW}/{entry['gif_url']}", f"{MIRROR_RAW}/{entry['image']}"]
            draw, source = mirror, f"render {title}"
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
        path = OUT / f"{slug(name)}.webp"
        path.write_bytes(data)
        total += len(data)
        print(f"  {path.name:32} {len(data) / 1024:5.1f} KB  {source}")

    kept = len(set(MIRROR) | set(ART) | set(PHOTO)) - len(failed)
    print(
        f"\n{kept} thumbnails, {total / 1024:.0f} KB total"
        + (f" — {given} from art-source/" if given else "")
    )
    for line in failed:
        print("FAILED " + line, file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
