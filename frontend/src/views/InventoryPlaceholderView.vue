<template>
  <div class="d-flex flex-column align-center justify-center text-center placeholder-wrap">
    <v-icon size="80" color="primary" class="mb-4">mdi-warehouse</v-icon>
    <h1 class="text-h5 mb-2">Quản lý kho</h1>
    <div class="text-body-2 text-medium-emphasis mb-4" style="max-width: 480px;">
      Module Quản lý kho (theo lô — batches, expiry, nhập/xuất, tồn theo brand)
      sẽ được build ở <strong>Session 3</strong> sau khi xong Session 2 (Đơn hàng).
    </div>
    <v-btn color="primary" prepend-icon="mdi-package-variant-closed" to="/products">
      Quay về Sản phẩm
    </v-btn>
  </div>
</template>

<style scoped>
.placeholder-wrap {
  min-height: 60vh;
  padding: 24px;
}
</style>
