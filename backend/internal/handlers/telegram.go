package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/alib/crm/internal/models"
	"github.com/alib/crm/internal/telegram"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type TelegramHandler struct {
	db *gorm.DB
	tg *telegram.Bot
}

func NewTelegramHandler(db *gorm.DB, tg *telegram.Bot) *TelegramHandler {
	return &TelegramHandler{db: db, tg: tg}
}

// statusAction описывает что делать при нажатии кнопки
type statusAction struct {
	status models.OrderStatus
	label  string
}

// Маппинг callback_data → статус заказа
var tgStatusActions = map[string]statusAction{
	"tg_accepted":   {models.StatusAccepted, "✅ Task accepted"},
	"tg_collected":  {models.StatusCollectionDetails, "📦 Goods accepted from customer"},
	"tg_warehouse":  {models.StatusWarehouse, "🏭 Delivered to warehouse"},
	"tg_dispatched": {models.StatusDispatched, "✈️ Delivered to gateway"},
}

// HandleUpdate обрабатывает одно обновление от Telegram (используется и webhook и polling).
func (h *TelegramHandler) HandleUpdate(update telegram.Update) {
	if update.CallbackQuery != nil {
		h.handleCallback(update.CallbackQuery)
	}
}

// Webhook принимает все события от Telegram (всегда отвечает 200).
func (h *TelegramHandler) Webhook(c *gin.Context) {
	var update telegram.Update
	if err := c.ShouldBindJSON(&update); err != nil {
		c.Status(http.StatusOK)
		return
	}
	h.HandleUpdate(update)
	c.Status(http.StatusOK)
}

func (h *TelegramHandler) handleCallback(cb *telegram.CallbackQuery) {
	// Формат: "action:orderID"  например "tg_accepted:42"
	parts := strings.SplitN(cb.Data, ":", 2)
	if len(parts) != 2 {
		h.tg.AnswerCallback(cb.ID, "Неверный формат данных")
		return
	}
	action, orderIDStr := parts[0], parts[1]

	orderID, err := strconv.ParseUint(orderIDStr, 10, 64)
	if err != nil {
		h.tg.AnswerCallback(cb.ID, "Неверный ID заказа")
		return
	}

	sa, ok := tgStatusActions[action]
	if !ok {
		h.tg.AnswerCallback(cb.ID, "Неизвестное действие")
		return
	}

	var order models.Order
	if h.db.First(&order, orderID).Error != nil {
		h.tg.AnswerCallback(cb.ID, "Заказ не найден")
		return
	}

	oldStatus := order.Status
	h.db.Model(&order).Update("status", sa.status)

	// Ищем пользователя по telegram_chat_id для логирования
	chatIDStr := strconv.FormatInt(cb.From.ID, 10)
	var user models.User
	h.db.Where("telegram_chat_id = ?", chatIDStr).First(&user)

	logUserID := uint(0)
	if user.ID > 0 {
		logUserID = user.ID
	}

	noteText := fmt.Sprintf("Telegram: %s (@%s)", sa.label, cb.From.Username)
	if cb.From.Username == "" {
		noteText = fmt.Sprintf("Telegram: %s (%s)", sa.label, cb.From.FirstName)
	}

	h.db.Create(&models.StatusHistory{
		OrderID:   order.ID,
		Status:    sa.status,
		Note:      noteText,
		ChangedBy: logUserID,
	})
	h.db.Create(&models.OrderLog{
		OrderID:  order.ID,
		UserID:   logUserID,
		Action:   "updated",
		Field:    "Статус",
		OldValue: string(oldStatus),
		NewValue: string(sa.status),
	})

	// Отвечаем на callback (убираем «часики»)
	h.tg.AnswerCallback(cb.ID, sa.label)

	// Редактируем оригинальное сообщение: убираем кнопки, добавляем отметку
	if cb.Message != nil {
		newText := fmt.Sprintf(
			"%s\n\n<b>%s</b>\n<i>Обновлено: %s</i>",
			cb.Message.Text, sa.label,
			cb.From.FirstName,
		)
		h.tg.EditMessage(
			strconv.FormatInt(cb.Message.Chat.ID, 10),
			cb.Message.MessageID,
			newText,
		)
	}
}
