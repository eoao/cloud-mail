<template>
  <div v-for="item in rows" style="background: var(--el-bg-color)">
    <div class="email-row">
      <el-checkbox disabled :class=" props.type === 'all-email' ? 'all-email-checkbox' : 'checkbox'"
      ></el-checkbox>
      <div class="pc-star" v-if="showStar">
        <Icon style="color: var(--el-border-color)" icon="solar:star-line-duotone" width="18" height="18"/>
      </div>
      <div v-if="!showStar"></div>
      <div class="title" :class="accountShow ? 'title-column' : 'title-column'">

        <div class="email-sender">
          <div class="email-status" v-if="showStatus">

          </div>
          <div v-else></div>
          <span class="name">
             <span>
               <el-skeleton animated>
                 <template #template>
                   <el-skeleton-item variant="text" class="name-skeleton"/>
                 </template>
               </el-skeleton>
             </span>
             <span></span>
          </span>
          <span class="phone-time">
            <el-skeleton animated>
              <template #template>
                <el-skeleton-item variant="text" style="width: 50px;height: 1rem;"/>
              </template>
            </el-skeleton>
          </span>
        </div>
        <div>
          <div class="email-text-skeleton">
            <el-skeleton animated>
              <template #template>
                <el-skeleton-item variant="text" class="text-skeleton-one"/>
                <el-skeleton-item variant="text" class="text-skeleton-two"/>
              </template>
            </el-skeleton>
          </div>
          <div class="user-info" v-if="showUserInfo">
            <div class="user">
              <el-skeleton animated>
                <template #template>
                  <el-skeleton-item variant="text"
                                    style="width: 180px;margin-right: 15px;height: 1rem;margin-bottom: 4px;"/>
                </template>
              </el-skeleton>
            </div>
            <div class="account">
              <el-skeleton animated>
                <template #template>
                  <el-skeleton-item variant="text"
                                    style="width: 180px;margin-right: 15px;height: 1rem;margin-bottom: 4px;"/>
                </template>
              </el-skeleton>
            </div>
            <div class="del-status" v-if="item.isDel">
              <el-tag type="danger" size="small">{{ $t('deleted') }}</el-tag>
            </div>
          </div>
        </div>
      </div>
      <div class="email-right-skeleton" :style="showUserInfo ? 'align-self: start;':''">
        <el-skeleton animated>
          <template #template>
            <el-skeleton-item variant="text" style="width: 50px;margin-right: 15px;height: 1rem;"/>
          </template>
        </el-skeleton>
      </div>
    </div>
  </div>
</template>
<script setup>
const props = defineProps({
  rows: {
    type: Number,
    default: 1
  },
  showStar: {
    type: Boolean,
    default: true
  },
  accountShow: {
    type: Boolean,
    default: false
  },
  showStatus: {
    type: Boolean,
    default: false
  },
  showUserInfo: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    default: ''
  }
})
import {Icon} from "@iconify/vue";
</script>

<style scoped lang="scss">

.phone-star {
  display: none;
}

.pc-star {
  display: flex;
  width: 40px;
}

@media (max-width: 1366px) {
  .pc-star {
    display: none;
  }
  .phone-star {
    display: block;
    align-self: end;
    padding-right: 16px;
    padding-top: 8px;
  }
  .star-pd {
    padding-top: 6px !important;
  }
}

</style>
