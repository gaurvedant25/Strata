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
   where all but one of the 406 thumbnails come from, and the credit is on the Image
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

    # ─── The wider library: three hundred more, the same way ───
    # Chest
    "Decline Barbell Bench Press": "GrO65fd",  # barbell decline bench press
    "Wide-Grip Bench Press": "JsKq9so",  # barbell wide bench press
    "Reverse-Grip Incline Bench Press": "DU7I633",  # barbell reverse grip incline bench press
    "Smith Machine Bench Press": "trqKQv2",  # smith bench press
    "Smith Machine Incline Press": "5v7KYld",  # smith incline bench press
    "Smith Machine Decline Press": "ETZfAbZ",  # smith decline bench press
    "Smith Machine Wide-Grip Bench Press": "zoOvPcx",  # smith wide grip bench press
    "Decline Dumbbell Press": "DwhEmmE",  # dumbbell decline bench press
    "Neutral-Grip Dumbbell Press": "pP8wP2P",  # dumbbell neutral grip bench press
    "Incline Neutral-Grip Dumbbell Press": "OVLmUuL",  # dumbbell incline palm-in press
    "Reverse-Grip Dumbbell Press": "UIbGx6H",  # dumbbell reverse bench press
    "Single-Arm Dumbbell Bench Press": "zGSIWQi",  # dumbbell lying one arm press
    "Single-Arm Incline Dumbbell Press": "PDaMuyV",  # dumbbell one arm incline chest press
    "Alternating Incline Dumbbell Press": "TVdivgY",  # dumbbell incline alternate press
    "Incline Dumbbell Fly": "ESOd5Pl",  # dumbbell incline fly
    "Decline Dumbbell Fly": "xXm4nYq",  # dumbbell decline fly
    "Single-Arm Dumbbell Fly": "o5Jsk92",  # dumbbell one arm bench fly
    "Dumbbell Pullover": "9XjtHvS",  # dumbbell pullover
    "Barbell Pullover": "i6LWjok",  # barbell pullover
    "Cable Crossover": "UKWTJWR",  # cable standing up straight crossovers
    "Incline Cable Fly": "tBWXbIT",  # cable incline fly
    "Decline Cable Fly": "7saC5zz",  # cable decline fly
    "Low Cable Fly": "FVmZVhk",  # cable low fly
    "Lying Cable Fly": "lJJ7Yq8",  # cable lying fly
    "Seated Cable Chest Press": "nIR4Rwl",  # cable seated chest press
    "Cable Bench Press": "7xI5MXA",  # cable bench press
    "Incline Cable Press": "Vh0GsK4",  # cable incline bench press
    "Decline Cable Press": "2Pya1cP",  # cable decline press
    "Incline Machine Chest Press": "jHAnWmT",  # lever incline chest press
    "Decline Machine Chest Press": "vsVoPHt",  # lever decline chest press
    "Kettlebell Floor Press": "rg59QCH",  # kettlebell one arm floor press
    "Medicine Ball Chest Pass": "aDoFKrE",  # medicine ball chest pass
    "Decline Push-up": "i5cEhka",  # decline push-up
    "Incline Push-up": "B1EVP9F",  # incline push-up
    "Wide Push-up": "JmMVpR3",  # wide hand push up
    "Clap Push-up": "wigSg76",  # clap push up
    "Plyometric Push-up": "Snj1wSv",  # plyo push up
    "Archer Push-up": "A9qxk2F",  # archer push up
    "Wall Push-up": "LEH9jxP",  # push-up (wall)
    "Shoulder Tap Push-up": "qEse6fe",  # shoulder tap push-up
    "Scapular Push-up": "jV65tKx",  # scapula push-up
    "One-Arm Push-up": "MUic5zN",  # single arm push-up
    "Planche Push-up": "gw9PqGk",  # full planche push-up
    "Suspension Push-up": "IaGQCrC",  # suspended push-up
    "Medicine Ball Push-up": "W8KAlkI",  # push-up medicine ball
    "Straight Bar Dip": "LQFOrMn",  # chest dip on straight bar
    "Ring Dip": "ezTvXcr",  # ring dips
    "Korean Dip": "rWoBmi5",  # korean dips
    "Assisted Dip": "PAgTVaK",  # assisted chest dip (kneeling)
    # Back
    "Pendlay Row": "r0z6xzQ",  # barbell pendlay row
    "Reverse-Grip Barbell Row": "SzX3uzM",  # barbell reverse grip bent over row
    "Incline Barbell Row": "dmgMp3n",  # barbell incline row
    "Chest-Supported Dumbbell Row": "7vG5o25",  # dumbbell incline row
    "Renegade Row": "b9kqlBy",  # kettlebell alternating renegade row
    "Kettlebell Row": "g9AsZ8P",  # kettlebell one arm row
    "Smith Machine Row": "ZX9UZmj",  # smith bent over row
    "Smith Machine One-Arm Row": "Q4DSJPC",  # smith one arm row
    "Machine Seated Row": "7I6LNUG",  # lever seated row
    "Machine High Row": "nZZZy9m",  # lever high row
    "Machine Bent-Over Row": "X3cqyXz",  # lever bent over row
    "Machine Single-Arm Row": "oROuvrX",  # lever unilateral row
    "Machine Pullover": "4U7iLb5",  # lever pullover
    "Machine Lat Pulldown": "7F1DVzn",  # lever front pulldown
    "Reverse-Grip Lat Pulldown": "xBYcQHj",  # cable underhand pulldown
    "Behind-the-Neck Pulldown": "SpsOSXk",  # cable rear pulldown
    "Single-Arm Lat Pulldown": "U5INZY6",  # cable one arm pulldown
    "Wide-Grip Seated Cable Row": "qcY50ZD",  # cable seated wide-grip row
    "Rope Seated Row": "SJqRxOt",  # cable rope seated row
    "Single-Arm Cable Row": "vpp9Ku2",  # cable seated one arm alternate row
    "Single-Arm Cable Bent-Over Row": "EIsE3u8",  # cable one arm bent over row
    "Standing Cable Row": "4f8RXP8",  # cable standing row (v-bar)
    "Kneeling Cable High Row": "ZSJNetl",  # cable high row (kneeling)
    "Cable Shrug": "Eg98Ft9",  # cable shrug
    "Machine Shrug": "ZZKbeMw",  # lever shrug
    "Smith Machine Shrug": "OUQ0ZyW",  # smith shrug
    "Incline Dumbbell Shrug": "JymLInS",  # dumbbell incline shrug
    "Trap Bar Deadlift": "jQGwmxN",  # trap bar deadlift
    "Rack Pull": "za9Ni4z",  # barbell rack pull
    "Dumbbell Deadlift": "nUwVh7b",  # dumbbell deadlift
    "Wide-Grip Pull-up": "Qqi7bko",  # wide grip pull-up
    "Neutral-Grip Pull-up": "0V2YQjW",  # pull up (neutral grip)
    "Close-Grip Chin-up": "VnfUNW7",  # close grip chin-up
    "Mixed-Grip Chin-up": "T8UpLkb",  # mixed grip chin-up
    "Behind-the-Neck Pull-up": "CbFSYC1",  # rear pull-up
    "Archer Pull-up": "72BC5Za",  # archer pull up
    "L-Sit Pull-up": "d1GgzTU",  # l-pull-up
    "One-Arm Chin-up": "HjdqmZa",  # one arm chin-up
    "Scapular Pull-up": "uTBt1HV",  # scapular pull-up
    "Muscle-up": "yJUHKTn",  # muscle up
    "Rope Climb": "yaAxcQr",  # rope climb
    "Suspension Row": "4OaumBr",  # suspended row
    "Front Lever Raise": "hbY9wqG",  # front lever reps
    "Front Lever": "PkCN2lv",  # front lever
    "Back Lever": "GaSzzuh",  # back lever
    "Assisted Pull-up": "kiJ4Z2K",  # assisted pull-up
    "Assisted Chin-up": "MaMuGH6",  # lever assisted chin-up
    # Shoulders
    "Military Press": "wdRZISl",  # barbell standing close grip military press
    "Behind-the-Neck Press": "ngPpyRS",  # barbell seated behind head military press
    "Bradford Press": "dCPESfR",  # barbell standing bradford press
    "Smith Machine Military Press": "jjUPrze",  # smith standing military press
    "Smith Machine Shoulder Press": "xUwnBMT",  # smith seated shoulder press
    "Standing Dumbbell Press": "A6wtbuL",  # dumbbell standing overhead press
    "Alternating Dumbbell Press": "bBi35y3",  # dumbbell standing alternate overhead press
    "Single-Arm Dumbbell Press": "84RyJf8",  # dumbbell one arm shoulder press
    "Neutral-Grip Shoulder Press": "f1jf47L",  # dumbbell seated shoulder press (parallel grip)
    "Cuban Press": "QfAKy1G",  # dumbbell cuban press
    "Cable Shoulder Press": "PzQanLE",  # cable shoulder press
    "Kettlebell Overhead Press": "blBXysN",  # kettlebell two arm military press
    "Kettlebell Arnold Press": "UM8mgyG",  # kettlebell arnold press
    "Kettlebell Push Press": "osdXT3K",  # kettlebell one arm push press
    "Seated Lateral Raise": "hxyTtWj",  # dumbbell seated lateral raise
    "Single-Arm Lateral Raise": "n5cWCsI",  # dumbbell one arm lateral raise
    "Machine Lateral Raise": "dRTfGZT",  # lever lateral raise
    "Lateral-to-Front Raise": "xMjBKwn",  # dumbbell lateral to front raise
    "Barbell Front Raise": "b2Uoz54",  # barbell front raise
    "Cable Front Raise": "u2X71Np",  # cable front raise
    "Seated Dumbbell Front Raise": "Ys97II0",  # dumbbell seated front raise
    "Incline Y-Raise": "PbzNu7c",  # dumbbell incline y-raise
    "Cable Reverse Fly": "aqvSOQE",  # cable cross-over revers fly
    "High Cable Reverse Fly": "P5p0j8B",  # cable standing cross-over high reverse fly
    "Seated Cable Rear Delt Raise": "x825CZm",  # cable seated rear lateral raise
    "Lying Rear Delt Raise": "53Ttlck",  # dumbbell lying rear lateral raise
    "Incline Rear Delt Raise": "vYk8lqw",  # dumbbell incline rear lateral raise
    "Band Reverse Fly": "sTfvVsG",  # band reverse fly
    "Barbell Rear Delt Row": "S9zHIvU",  # barbell rear delt row
    "Dumbbell Upright Row": "ainizkb",  # dumbbell upright row
    "Cable Upright Row": "cALKspW",  # cable upright row
    "Wide-Grip Upright Row": "RgJDRR1",  # barbell wide-grip upright row
    "Smith Machine Upright Row": "1DN3iz4",  # smith upright row
    "Cable External Rotation": "FWdVhcW",  # cable standing shoulder external rotation
    "Cable Internal Rotation": "YPoVrBi",  # cable seated shoulder internal rotation
    "Dumbbell External Rotation": "bmBf7LN",  # dumbbell lying external shoulder rotation
    "Handstand Push-up": "rQxwMxO",  # handstand push-up
    "Handstand Hold": "XooAdhl",  # handstand
    # Arms
    "Drag Curl": "IENzBdA",  # barbell drag curl
    "Reverse Barbell Curl": "xNrS20v",  # barbell reverse curl
    "Wide-Grip Barbell Curl": "faHKVkK",  # barbell standing wide grip biceps curl
    "Close-Grip Barbell Curl": "4dUn2iv",  # barbell standing close grip curl
    "Barbell Hammer Curl": "o1ntciW",  # olympic barbell hammer curl
    "Reverse Preacher Curl": "4LIG9xr",  # barbell reverse preacher curl
    "EZ-Bar Preacher Curl": "hacCyUv",  # ez barbell close grip preacher curl
    "Close-Grip EZ-Bar Curl": "V4ryaZa",  # ez barbell close-grip curl
    "Reverse EZ-Bar Curl": "Y5X65IB",  # ez barbell reverse grip curl
    "Spider Curl": "2kattbR",  # ez barbell spider curl
    "Incline Dumbbell Curl": "F3xgbjF",  # dumbbell incline biceps curl
    "Incline Hammer Curl": "ByX0WxV",  # dumbbell incline hammer curl
    "Cross-Body Hammer Curl": "Qyk5J3p",  # dumbbell cross body hammer curl
    "Alternating Hammer Curl": "6em2Dxj",  # dumbbell alternate seated hammer curl
    "Seated Hammer Curl": "IGtBdNT",  # dumbbell seated hammer curl
    "Alternating Dumbbell Curl": "BU15nH4",  # dumbbell alternate biceps curl
    "Seated Dumbbell Curl": "TiaZTxx",  # dumbbell seated curl
    "Zottman Curl": "kXaIn5A",  # dumbbell zottman curl
    "Dumbbell Preacher Curl": "jivWf8n",  # dumbbell preacher curl
    "Reverse Dumbbell Curl": "0IgNjSM",  # dumbbell standing reverse curl
    "Waiter Curl": "KOpzGBL",  # dumbbell waiter biceps curl
    "Rope Hammer Curl": "HPlPoQA",  # cable hammer curl (with rope)
    "Overhead Cable Curl": "wDUqY2u",  # cable overhead curl
    "Cable Preacher Curl": "P2lNrGL",  # cable preacher curl
    "Cable Reverse Curl": "eOG0r6v",  # cable reverse curl
    "Single-Arm Cable Curl": "YTur5nR",  # cable one arm curl
    "Cable Concentration Curl": "NvfE43H",  # cable concentration curl
    "Seated Cable Curl": "8oYqOt9",  # cable seated curl
    "Cable Drag Curl": "dXz8zjF",  # cable drag curl
    "Machine Bicep Curl": "q6y3OhV",  # lever bicep curl
    "Machine Preacher Curl": "b6hQYMb",  # lever preacher curl
    "JM Press": "ZsiqXYa",  # barbell jm bench press
    "Reverse-Grip Skull Crusher": "yRLPCLu",  # barbell reverse grip skullcrusher
    "Seated Barbell Overhead Extension": "5uFK1xr",  # barbell seated overhead triceps extension
    "Seated EZ-Bar Extension": "iaapw0g",  # ez barbell seated triceps extension
    "Dumbbell Skull Crusher": "mpKZGWz",  # dumbbell lying triceps extension
    "Seated Dumbbell Overhead Extension": "kont8Ut",  # dumbbell seated triceps extension
    "Single-Arm Overhead Extension": "BCUR88E",  # dumbbell standing one arm extension
    "Incline Dumbbell Triceps Extension": "OVIKwsd",  # dumbbell incline triceps extension
    "Tate Press": "s5PdDyY",  # dumbbell tate press
    "Close-Grip Dumbbell Press": "7jGOBF3",  # dumbbell close grip press
    "Single-Arm Dumbbell Kickback": "bQy2Eni",  # dumbbell one arm kickback
    "Cable Overhead Triceps Extension": "2IxROQ1",  # cable overhead triceps extension (rope attachment)
    "Reverse-Grip Pushdown": "VjYliFZ",  # cable reverse-grip pushdown
    "V-Bar Pushdown": "gAwDzB3",  # cable triceps pushdown (v-bar)
    "Single-Arm Pushdown": "qRZ5S1N",  # cable one arm tricep pushdown
    "Cable Triceps Kickback": "vvNjDJS",  # cable two arm tricep kickback
    "Machine Triceps Extension": "Ser9eQp",  # lever triceps extension
    "Seated Dip Machine": "BRImeP8",  # lever seated dip
    "Close-Grip Push-up": "x6KpKpq",  # close-grip push-up
    "Diamond Push-up": "soIB2rj",  # diamond push-up
    "Triceps Dip": "X6C6i5Y",  # triceps dip
    "Reverse Wrist Curl": "LsZkfU6",  # barbell reverse wrist curl
    "Dumbbell Wrist Curl": "q8aHNoF",  # dumbbell one arm wrist curl
    "Dumbbell Reverse Wrist Curl": "BLCvwr2",  # dumbbell reverse wrist curl
    "Behind-the-Back Wrist Curl": "2qTvJAZ",  # barbell standing back wrist curl
    "Cable Wrist Curl": "LrV4s90",  # cable wrist curl
    "Finger Curl": "awG04cF",  # finger curls
    "Hand Gripper": "mKwcrHn",  # lever gripper hands
    # Legs
    "High-Bar Squat": "Gnfo4FM",  # barbell high bar squat
    "Low-Bar Squat": "bTpEUcm",  # barbell low bar squat
    "Barbell Sumo Squat": "s7HX1BY",  # barbell wide squat
    "Box Squat": "W9pFVv1",  # barbell bench squat
    "Overhead Squat": "gfk9kD4",  # barbell overhead squat
    "Zercher Squat": "LSTChY9",  # barbell zercher squat
    "Barbell Hack Squat": "5VCj6iH",  # barbell hack squat
    "Barbell Jump Squat": "1gFNTZV",  # barbell jump squat
    "Smith Machine Squat": "jFtipLl",  # smith squat
    "Smith Machine Front Squat": "lFhb2Rw",  # smith front squat (clean grip)
    "Smith Machine Hack Squat": "ZuPXtCK",  # smith hack squat
    "Smith Machine Leg Press": "7zdxRTl",  # smith leg press
    "Smith Machine Split Squat": "wWFspEi",  # smith single leg split squat
    "Dumbbell Squat": "HsvHqgf",  # dumbbell squat
    "Bulgarian Split Squat": "qx4fgX7",  # dumbbell single leg split squat
    "Barbell Bulgarian Split Squat": "gGNQmVt",  # barbell single leg split squat
    "Barbell Lunge": "t8iSghb",  # barbell lunge
    "Dumbbell Lunge": "RRWFUcw",  # dumbbell lunge
    "Dumbbell Reverse Lunge": "SSsBDwB",  # dumbbell rear lunge
    "Lateral Lunge": "py1HSzx",  # barbell lateral lunge
    "Barbell Step-up": "Kxquu2E",  # barbell step-up
    "Stiff-Leg Deadlift": "hrVQWvE",  # barbell straight leg deadlift
    "Dumbbell Stiff-Leg Deadlift": "5eLRITT",  # dumbbell stiff leg deadlift
    "Dumbbell Romanian Deadlift": "rR0LJzx",  # dumbbell romanian deadlift
    "Single-Leg Romanian Deadlift": "gKozT8X",  # dumbbell single leg deadlift
    "Seated Leg Curl": "Zg3XY7P",  # lever seated leg curl
    "Kneeling Leg Curl": "nnmCTLN",  # lever kneeling leg curl
    "Single-Leg Leg Press": "WWD6FzI",  # sled 45 degrees one leg press
    "Hip Adduction Machine": "oHsrypV",  # lever seated hip adduction
    "Cable Hip Adduction": "hBGWILP",  # cable hip adduction
    "Barbell Calf Raise": "8ozhUIZ",  # barbell standing calf raise
    "Barbell Seated Calf Raise": "ipvgBnC",  # barbell seated calf raise
    "Dumbbell Calf Raise": "dPmaUaU",  # dumbbell standing calf raise
    "Dumbbell Seated Calf Raise": "r29jP7S",  # dumbbell seated calf raise
    "Single-Leg Calf Raise": "1kB3Wmk",  # dumbbell single leg calf raise
    "Leg Press Calf Raise": "ykHcWme",  # sled calf press on leg press
    "Smith Machine Calf Raise": "6MaEjVA",  # smith standing leg calf raise
    "Donkey Calf Raise": "u5ESqzH",  # donkey calf raise
    "Bodyweight Calf Raise": "bJYHBIN",  # bodyweight standing calf raise
    "Jump Squat": "LIlE5Tn",  # jump squat
    "Pistol Squat": "nqs5HGV",  # single leg squat (pistol) male
    "Sissy Squat": "xdYPUtE",  # sissy squat
    "Curtsy Squat": "gUjqdei",  # curtsey squat
    "Jump Lunge": "PM1PZjg",  # lunge with jump
    "Glute-Ham Raise": "Vvwjz6N",  # glute-ham raise
    "Nordic Hamstring Curl": "ms7tjSG",  # inverse leg curl (bench support)
    # Glutes
    "Reverse Hyperextension": "Krmb3cB",  # lever reverse hyperextension
    "Hip Abduction Machine": "CHpahtl",  # lever seated hip abduction
    "Cable Hip Extension": "Kpajagk",  # cable standing hip extension
    "Band Pull-Through": "VtTbiP3",  # band pull through
    "Dumbbell Sumo Pull-Through": "BmrwWzo",  # dumbbell sumo pull through
    "Glute Bridge March": "GibBPPg",  # glute bridge march
    "Single-Leg Glute Bridge": "rmEukuS",  # single leg bridge with outstretched leg
    "Bodyweight Hip Thrust": "aWedzZX",  # glute bridge two legs on bench (male)
    "Side-Lying Leg Raise": "7WaDzyL",  # side hip abduction
    "Monster Walk": "O95afRA",  # monster walk
    # Core
    "Lying Leg Raise": "WhuFnR7",  # lying leg raise flat bench
    "Seated Leg Raise": "Hgs6Nl1",  # seated leg raise
    "Incline Leg Raise": "eVxAzgz",  # incline leg hip raise (leg straight)
    "Captain's Chair Leg Raise": "weoDEpH",  # captains chair straight leg raise
    "Hanging Oblique Knee Raise": "BaE7O6U",  # hanging oblique knee raise
    "Hanging Pike": "nuBF9MO",  # hanging pike
    "Bench Leg Pull-in": "OyoZ3Pu",  # leg pull in flat bench
    "Reverse Crunch": "nCU1Ekp",  # reverse crunch
    "Decline Crunch": "9Ap7miY",  # decline crunch
    "Decline Sit-up": "QLL2gdc",  # decline sit-up
    "Oblique Crunch": "QUDd8WS",  # oblique crunches floor
    "Cross-Body Crunch": "rbu5UUb",  # cross body crunch
    "Tuck Crunch": "BMMolZ3",  # tuck crunch
    "Elbow-to-Knee Crunch": "jvp6DiD",  # elbow-to-knee
    "Jackknife Sit-up": "mbkgB44",  # jackknife sit-up
    "Flutter Kicks": "UVo2Qs2",  # flutter kicks
    "Plank Shoulder Tap": "yRpV5TC",  # shoulder tap
    "Inchworm": "ZgsNQ6d",  # inchworm
    "Side Plank": "RKjH6Lt",  # side bridge v. 2
    "Reverse Plank": "tFToB7l",  # reverse plank with leg lift
    "V-Sit": "ZuXu4Eq",  # v-sit on floor
    "L-Sit": "UpWmA5E",  # l-sit on floor
    "Human Flag": "pQ0Mx1Z",  # flag
    "Planche": "YZ4961r",  # full planche
    "Planche Lean": "LYJodFS",  # lean planche
    "Standing Cable Crunch": "jpgqxiS",  # cable standing crunch
    "Cable Reverse Crunch": "RqOtqD7",  # cable reverse crunch
    "Cable Side Bend": "wPypxFY",  # cable side bend
    "Seated Cable Twist": "UEjSrKI",  # cable seated twist
    "Dumbbell Side Bend": "IpONWYv",  # dumbbell side bend
    "Pallof Press": "9pa4H5m",  # band horizontal pallof press
    "Landmine Rotation": "QYysSLV",  # landmine 180
    "Machine Crunch": "Wgaz7pm",  # lever seated crunch
    "Kettlebell Windmill": "9Tkqa9O",  # kettlebell windmill
    # Cardio
    "Burpee": "dK9394r",  # burpee
    "Star Jump": "HtfCpfi",  # star jump (male)
    "Skater Hops": "zfNHMN9",  # skater hops
    "Bear Crawl": "0Yz8WdV",  # bear crawl
    "Running": "oLrKqDH",  # run
    "Battle Ropes": "RJa4tCo",  # battling ropes
    "Ski Erg": "vpQaQkH",  # ski ergometer
    "Arm Bike": "pAIWRGu",  # hands bike
    "Jumping Jack": "f9lVSSI",  # astride jumps (male)
    "Scissor Jumps": "Eh2v5Iu",  # scissor jumps (male)
    "Broad Jump": "uZKq7lo",  # forward jump
    "Dumbbell Burpee": "0JtKWum",  # dumbbell burpee
    "Jog in Place": "CcWEoWV",  # short stride run
    "High Knees": "PrQbjvB",  # push to run
    "Shadow Boxing": "hoXt6wv",  # left hook. boxing
    "Spin Bike Sprint": "H1PESYI",  # stationary bike run
    "Air Bike": "XSCHmiI",  # cycle cross trainer
    # Other
    "Kettlebell Snatch": "aXcUyKb",  # kettlebell one arm snatch
    "Kettlebell Clean": "LHWF7us",  # kettlebell hang clean
    "Kettlebell Clean and Jerk": "vzAxBtt",  # kettlebell one arm clean and jerk
    "Kettlebell Thruster": "yWxMvB5",  # kettlebell thruster
    "Kettlebell High Pull": "8ARQ9Hw",  # kettlebell sumo high pull
    "Dumbbell Clean": "7Hg55JG",  # dumbbell clean
    "Dumbbell Snatch": "6pTkI99",  # dumbbell one arm snatch
    "Overhead Carry": "mWBtgmb",  # dumbbell single arm overhead carry
    "Medicine Ball Slam": "oHg8eop",  # medicine ball overhead slam
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
    request = urllib.request.Request(url, headers={"User-Agent": "strata/1.0"})
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
