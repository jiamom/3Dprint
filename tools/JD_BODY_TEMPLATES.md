# JDloves3d reference bodies

The connected-keycap menu uses three exterior styles from the user-provided
`JDloves3d_Clicker_Base3_Keycaps.3mf`: Frill, Spiky, and Pebble. The previous
procedural smooth-bar body is no longer a menu option.

`build-jd-body-templates.py <source.3mf>` rebuilds the three `jd-body-*.js`
assets. It requires Python with numpy, trimesh, and manifold3d. Runtime users
need none of these: the prepared geometry loads as ordinary local JavaScript,
including when the page is opened from a local file.

Each style contains 1–8-slot variants. The original plain end is mirrored to
provide an end without the source model's fixed keyring tab, and the original
centre section is repeated. Exterior simplification tolerance is 0.03 mm.
Source style names and author attribution are retained in the assets and exports.

Original mounting voids are filled and recut to the application's existing
switch dimensions, rather than scaling the complete reference model. The
working baseline height is 17.3 mm; added height extends the bottom portion.
Slot pitch follows the reference (21.5998 mm for Frill, 21.10035 mm for the other
styles). The cap basis remains fixed at 22 mm, with separate 19 mm lids. The
rounding controls apply to the lids; body ornamentation is determined by the
selected reference type.

The optional adjustable eyelet and neck are a same-colour part inside the
same 3MF body object. They overlap the solid exterior, and the eyelet hole
remains outside the reference body's bounds. Body downloads include this part.
Spiky and Pebble assets load on demand; only Frill is included at startup.
