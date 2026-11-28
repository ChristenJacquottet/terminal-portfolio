# Relay 23

The Apple II is the radio operator’s terminal aboard a recommissioned Kharkivchanka. The 1958 Antarctic expedition vehicle supplies the physical proportions. The crew, the relief traverse and the failed allocation system belong to the fiction. Start at polar dusk, turn left at the bench and read the receiver’s last dispatch. The same entry is available with `cat ~/watch.log`.

![The radio bench, expedition plate, and illuminated relay hut seen through the porthole](relay-23.jpg)

## What happened to the world

Relay Six lost a meter. A dispatch system inferred that everyone had left, reassigned its fuel, and made that decision look increasingly reasonable with every subsequent week of missing data. The people aboard No. 23 can still use that system to draft a crossing. Someone walks the flags before the driver trusts the route. Someone has to hear a voice before the operator closes an entry.

That leaves room for people on both ends of the radio to matter. Eleven people need fuel. They also have a spare valve the crawler needs. A light in the blowing snow, a tape someone took the trouble to label, and a second berth have different meanings once you know there’s somebody else out there.

## Inside the vehicle

Use the long hull to order the space. The bench runs along the side, so looking up takes in the porthole and looking right finds the rack within arm’s reach. Behind the operator is the future passage between driving position, berths and galley. The first scene uses the radio bench and two berths. The warm task light marks a place where repairs happen. Cold light comes through real circular openings. The original globe, photographs, cassette player and project disks are things this particular operator brought aboard.

The bunker reference suggests an improvised broadcast installation. Mount the receiver on a bolted shelf, run heat along the hull and give the controls enough space for a hand. One repaired circuit that feeds both a lamp and a radio tells more about scarcity than a wall of warning signs.

## Extending the prototype

- `src/cabin.ts` owns the hull in metres, openings, berths, receiver and watch plate. The room origin stays at the radio bench. An exterior shell can align to that origin when a route takes the visitor outside.
- `src/room.ts` still supplies the desk bounds, window position and lighting to the existing interactions. The cabin receives one exterior texture and blends its exposure with the watch. The polar landscape is an original generated matte. A second biome would need its own horizon, light colours and weather sound together.
- The first walkable route should be bench → berth → driver’s seat. Use those three standing positions to test aisle clearance, low overheads and the view back to the Apple II on a phone before adding unrestricted movement. Desktop terminal focus, touch look and picking already have their own input paths.

## Model references

Snupp’s **Kharkovchanka** is listed as downloadable under CC BY 4.0. The listing describes a PBR tracked vehicle with a 4K texture set. Inspect the downloaded mesh for interior coverage and match the porthole locations before mounting an exterior. The prototype builds its own cabin from the supplied cutaways. [Vehicle listing](https://sketchfab.com/3d-models/kharkovchanka-dc183abfd28048f5839d1edb43f660e3) · [License](https://creativecommons.org/licenses/by/4.0/)

Bohdan Lvov’s **Underground Bunker** is a reference for an inhabited radio installation and its practical lighting. [Bunker listing](https://sketchfab.com/3d-models/underground-bunker-720d2958484345d7b535554e14122b5c)
