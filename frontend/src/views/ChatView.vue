<template>
  <div class="chat-container d-flex" :style="containerStyle">
    <!-- Conversation list — hidden on mobile when a thread is open -->
    <div
      v-if="!mobile || !selectedConvId"
      class="chat-panel-left"
      :style="leftPanelStyle"
    >
      <ConversationList
        :conversations="conversations"
        :selected-id="selectedConvId"
        :loading="loadingConvs"
        v-model:search="searchQuery"
        @select="selectConversation"
        @filter-account="onFilterAccount"
      />
      <div v-if="!mobile" class="resize-handle" @mousedown="startResize('left', $event)" />
    </div>

    <!-- Message thread — hidden on mobile when no thread is selected -->
    <div
      v-if="!mobile || selectedConvId"
      :style="threadWrapStyle"
      class="d-flex flex-column"
    >
      <!-- Mobile back button -->
      <div
        v-if="mobile"
        class="px-2 py-1 d-flex align-center"
        style="background: var(--brand-navy-800); border-bottom: 1px solid var(--brand-navy-600);"
      >
        <v-btn
          icon
          variant="text"
          size="small"
          color="primary"
          @click="closeThread"
          aria-label="Quay lại danh sách"
        >
          <v-icon>mdi-chevron-left</v-icon>
        </v-btn>
        <span class="text-body-2 ml-1 text-truncate">
          {{ selectedConv?.contact?.fullName ?? 'Cuộc trò chuyện' }}
        </span>
      </div>
      <MessageThread
        :conversation="selectedConv"
        :messages="messages"
        :loading="loadingMsgs"
        :sending="sendingMsg"
        @send="sendMessage"
        @toggle-contact-panel="showContactPanel = !showContactPanel"
        :show-contact-panel="showContactPanel"
        style="flex: 1; min-width: 0;"
      />
    </div>

    <!-- Contact panel — desktop only -->
    <div
      v-if="!mobile && showContactPanel && selectedConv?.contact"
      class="chat-panel-right"
      :style="{ width: rightWidth + 'px' }"
    >
      <div class="resize-handle resize-handle-left" @mousedown="startResize('right', $event)" />
      <ChatContactPanel
        :contact-id="selectedConv.contact.id"
        :contact="selectedConv.contact"
        @close="showContactPanel = false"
        @saved="fetchConversations()"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useDisplay } from 'vuetify';
import ConversationList from '@/components/chat/ConversationList.vue';
import MessageThread from '@/components/chat/MessageThread.vue';
import ChatContactPanel from '@/components/chat/ChatContactPanel.vue';
import { useChat } from '@/composables/use-chat';

const display = useDisplay();
const mobile = computed(() => display.smAndDown.value);

const {
  conversations, selectedConvId, selectedConv, messages,
  loadingConvs, loadingMsgs, sendingMsg, searchQuery, accountFilter,
  fetchConversations, selectConversation, sendMessage,
  initSocket, destroySocket,
} = useChat();

function onFilterAccount(id: string | null) {
  accountFilter.value = id;
  fetchConversations();
}

function closeThread() {
  selectedConvId.value = null;
}

const showContactPanel = ref(false);

const containerStyle = computed(() =>
  mobile.value
    ? {}
    : { height: 'calc(100vh - 64px)' },
);

const leftPanelStyle = computed(() =>
  mobile.value ? {} : { width: leftWidth.value + 'px' },
);

const threadWrapStyle = computed(() =>
  mobile.value
    ? { flex: '1 1 auto', minHeight: 0 }
    : { flex: '1 1 auto', minWidth: '300px' },
);

// Resizable panel widths (restored from localStorage)
const leftWidth = ref(parseInt(localStorage.getItem('chat-left-width') || '320'));
const rightWidth = ref(parseInt(localStorage.getItem('chat-right-width') || '320'));

let resizing: 'left' | 'right' | null = null;
let startX = 0;
let startWidth = 0;

function startResize(panel: 'left' | 'right', e: MouseEvent) {
  resizing = panel;
  startX = e.clientX;
  startWidth = panel === 'left' ? leftWidth.value : rightWidth.value;
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function onResize(e: MouseEvent) {
  if (!resizing) return;
  const diff = e.clientX - startX;
  if (resizing === 'left') {
    leftWidth.value = Math.max(200, Math.min(500, startWidth + diff));
  } else {
    rightWidth.value = Math.max(250, Math.min(500, startWidth - diff));
  }
}

function stopResize() {
  if (resizing) {
    localStorage.setItem('chat-left-width', String(leftWidth.value));
    localStorage.setItem('chat-right-width', String(rightWidth.value));
  }
  resizing = null;
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

onMounted(() => { fetchConversations(); initSocket(); });
onUnmounted(() => { destroySocket(); });

let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchQuery, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchConversations(), 300);
});
</script>

<style scoped>
.chat-container {
  margin: -12px;
}

.chat-panel-left {
  position: relative;
  flex-shrink: 0;
  min-width: 200px;
  max-width: 500px;
}

.chat-panel-right {
  position: relative;
  flex-shrink: 0;
  min-width: 250px;
  max-width: 500px;
}

/* Resize handle — thin vertical line on the edge */
.resize-handle {
  position: absolute;
  top: 0;
  right: -2px;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background 0.2s;
}

.resize-handle:hover,
.resize-handle:active {
  background: rgba(0, 242, 255, 0.3);
}

.resize-handle-left {
  right: auto;
  left: -2px;
}
</style>
