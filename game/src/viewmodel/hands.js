/* ============================================================================
   Кисти GLB на скелете бойца (вид со стороны) — не зависят от оружия.

   Те же перчатки с костями пальцев, что и в риге от первого лица
   (viewmodel/vm.js). Кисть крепится к кости запястья; поворот кисти рига
   переводится в поворот кости запястья (wristQuat). Позы пальцев — формат
   GVM.pose(thumb, index, middle, ring, pinky).

   API (self.GHands):
     attachHands(char, assets) -> { R: GlovedHand, L: GlovedHand } | null
     wristQuat(anchorQuat, 'R'|'L', outQuat) -> outQuat
     handBasis(side) -> Quaternion         // side: 1 правая, -1 левая
     POSES.relaxed / POSES.relaxedL        // кисть опущена вдоль бедра
   ========================================================================== */
(function (root, factory) {
  const H = factory(root.THREE, root.GVM);
  if (typeof module !== 'undefined' && module.exports) module.exports = H;
  else root.GHands = H;
})(typeof self !== 'undefined' ? self : this, function (THREE, VM) {
  'use strict';
  if (!VM) return null;
  const P = VM.pose;

  /* Кисть рига: -Z к пальцам, +Y — тыл, +X — к мизинцу у правой. Кость
     запястья бойца в покое: пальцы по ±X (своя сторона), тыл вверх, большой
     палец вперёд (-Z). C — поворот кисти рига в системе кости. */
  function handBasis(side) {
    const z = new THREE.Vector3(-side, 0, 0), y = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(y, z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
  const C_R = handBasis(1), C_L = handBasis(-1);
  const C_INV = { R: C_R.clone().invert(), L: C_L.clone().invert() };

  let gloveMat = null;
  function attachHands(char, assets) {
    if (!assets) return null;
    gloveMat = gloveMat || VM.createGloveMaterial();
    const out = {};
    for (const [SS, side, src] of [['R', 'right', assets.right], ['L', 'left', assets.left]]) {
      const h = new VM.GlovedHand(assets.clone(src), side, gloveMat);
      h.anchor.quaternion.copy(SS === 'R' ? C_R : C_L);
      h.anchor.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      char.bone('wrist' + SS).add(h.anchor);
      out[SS] = h;
    }
    return out;
  }

  /* Поворот кости запястья в мире по мировому повороту кисти рига. */
  function wristQuat(anchorQuat, SS, out) {
    return out.copy(anchorQuat).multiply(C_INV[SS]);
  }

  /* Расслабленная кисть: пальцы чуть согнуты, большой палец вдоль указательного. */
  const relaxed = P([0.25, 0.2, 0.15, 0, 0.1], [0.02, 0.28, 0.32, 0.18, 0], [0.02, 0.38, 0.42, 0.22, 0],
    [0.04, 0.46, 0.48, 0.25, 0], [0.08, 0.52, 0.5, 0.26, 0]);

  return { attachHands, wristQuat, handBasis, POSES: { relaxed, relaxedL: relaxed } };
});
