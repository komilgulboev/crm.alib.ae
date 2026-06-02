package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type Bot struct {
	token string
}

func NewBot(token string) *Bot {
	return &Bot{token: token}
}

func (b *Bot) Enabled() bool {
	return b.token != ""
}

// ── Inline keyboard types ─────────────────────────────────────────────────────

type InlineKeyboardButton struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data"`
}

type InlineKeyboardMarkup struct {
	InlineKeyboard [][]InlineKeyboardButton `json:"inline_keyboard"`
}

// ── Telegram Update types (webhook payload) ───────────────────────────────────

type Update struct {
	UpdateID      int            `json:"update_id"`
	Message       *Message       `json:"message"`
	CallbackQuery *CallbackQuery `json:"callback_query"`
}

type Message struct {
	MessageID int    `json:"message_id"`
	Chat      Chat   `json:"chat"`
	Text      string `json:"text"`
}

type Chat struct {
	ID int64 `json:"id"`
}

type CallbackQuery struct {
	ID      string   `json:"id"`
	From    TGUser   `json:"from"`
	Message *Message `json:"message"`
	Data    string   `json:"data"`
}

type TGUser struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	Username  string `json:"username"`
}

// ── Send message ──────────────────────────────────────────────────────────────

type sendMessagePayload struct {
	ChatID      string                `json:"chat_id"`
	Text        string                `json:"text"`
	ParseMode   string                `json:"parse_mode"`
	ReplyMarkup *InlineKeyboardMarkup `json:"reply_markup,omitempty"`
}

func (b *Bot) SendMessage(chatID, text string) {
	if !b.Enabled() || chatID == "" {
		return
	}
	go b.post("sendMessage", sendMessagePayload{
		ChatID:    chatID,
		Text:      text,
		ParseMode: "HTML",
	})
}

func (b *Bot) SendMessageWithButtons(chatID, text string, keyboard *InlineKeyboardMarkup) {
	if !b.Enabled() || chatID == "" {
		return
	}
	go b.post("sendMessage", sendMessagePayload{
		ChatID:      chatID,
		Text:        text,
		ParseMode:   "HTML",
		ReplyMarkup: keyboard,
	})
}

// ── Answer callback query (убирает «часики» после нажатия кнопки) ─────────────

type answerCallbackPayload struct {
	CallbackQueryID string `json:"callback_query_id"`
	Text            string `json:"text"`
	ShowAlert       bool   `json:"show_alert"`
}

func (b *Bot) AnswerCallback(queryID, text string) {
	if !b.Enabled() {
		return
	}
	go b.post("answerCallbackQuery", answerCallbackPayload{
		CallbackQueryID: queryID,
		Text:            text,
	})
}

// ── Edit message (убирает кнопки после нажатия) ───────────────────────────────

type editMessagePayload struct {
	ChatID      string                `json:"chat_id"`
	MessageID   int                   `json:"message_id"`
	Text        string                `json:"text"`
	ParseMode   string                `json:"parse_mode"`
	ReplyMarkup *InlineKeyboardMarkup `json:"reply_markup,omitempty"`
}

func (b *Bot) EditMessage(chatID string, messageID int, text string) {
	if !b.Enabled() {
		return
	}
	go b.post("editMessageText", editMessagePayload{
		ChatID:      chatID,
		MessageID:   messageID,
		Text:        text,
		ParseMode:   "HTML",
		ReplyMarkup: &InlineKeyboardMarkup{InlineKeyboard: [][]InlineKeyboardButton{}},
	})
}

// ── Register webhook ──────────────────────────────────────────────────────────

func (b *Bot) SetWebhook(webhookURL string) error {
	if !b.Enabled() {
		return nil
	}
	type payload struct {
		URL string `json:"url"`
	}
	body, _ := json.Marshal(payload{URL: webhookURL})
	url := fmt.Sprintf("https://api.telegram.org/bot%s/setWebhook", b.token)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("setWebhook: %w", err)
	}
	defer resp.Body.Close()
	log.Printf("telegram: webhook registered at %s (status %d)", webhookURL, resp.StatusCode)
	return nil
}

// ── Polling (альтернатива webhook, работает без HTTPS) ────────────────────────

type UpdateHandler func(update Update)

// StartPolling запускает фоновый воркер, который каждые 2 сек опрашивает Telegram.
// Вызывает handler для каждого входящего обновления.
// Останавливается когда ctx отменён.
func (b *Bot) StartPolling(ctx context.Context, handler UpdateHandler) {
	if !b.Enabled() {
		return
	}
	// Сначала сбрасываем webhook (если был установлен)
	b.post("deleteWebhook", map[string]bool{"drop_pending_updates": false})

	log.Println("telegram: polling started")
	offset := 0

	go func() {
		for {
			select {
			case <-ctx.Done():
				log.Println("telegram: polling stopped")
				return
			default:
			}

			updates, err := b.getUpdates(offset)
			if err != nil {
				log.Printf("telegram: getUpdates error: %v", err)
				time.Sleep(5 * time.Second)
				continue
			}

			for _, u := range updates {
				handler(u)
				offset = u.UpdateID + 1
			}

			if len(updates) == 0 {
				time.Sleep(2 * time.Second)
			}
		}
	}()
}

func (b *Bot) getUpdates(offset int) ([]Update, error) {
	url := fmt.Sprintf(
		"https://api.telegram.org/bot%s/getUpdates?offset=%d&timeout=30",
		b.token, offset,
	)
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result struct {
		OK     bool     `json:"ok"`
		Result []Update `json:"result"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return result.Result, nil
}

// ── Internal HTTP helper ──────────────────────────────────────────────────────

func (b *Bot) post(method string, payload any) {
	body, _ := json.Marshal(payload)
	url := fmt.Sprintf("https://api.telegram.org/bot%s/%s", b.token, method)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("telegram: %s failed: %v", method, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		log.Printf("telegram: %s non-200: %d", method, resp.StatusCode)
	}
}
